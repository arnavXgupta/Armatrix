import type { Candidate, RawMesh } from '../geometry/types'

export type WorkerIn = { id: number } & ({ type: 'load'; buffer: ArrayBuffer } | { type: 'candidates'; thresholdDeg: number })
export type Stage = 'parse' | 'index'
export type Loaded = { mesh: RawMesh; vertices: number; nonManifold: number }
export type CandidatesResult = { candidates: Candidate[]; ms: number }
export type WorkerOut = { id: number } & (
  | { type: 'progress'; stage: Stage; value: number }
  | ({ type: 'loaded' } & Loaded)
  | ({ type: 'candidates' } & CandidatesResult)
  | { type: 'error'; message: string }
)

type Pending = {
  kind: WorkerIn['type']
  resolve: (v: never) => void
  reject: (e: Error) => void
  onProgress?: (stage: Stage, value: number) => void
}

let worker: Worker | null = null
let nextId = 1
let epoch = 0
const pending = new Map<number, Pending>()

/** Changes whenever the worker is replaced, i.e. it no longer holds the last loaded part. */
export const workerEpoch = () => epoch

export class CancelledError extends Error {}

function reset(err: Error) {
  worker?.terminate()
  worker = null
  epoch++
  for (const p of pending.values()) p.reject(err)
  pending.clear()
}

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data
    const p = pending.get(msg.id)
    if (!p) return
    if (msg.type === 'progress') return p.onProgress?.(msg.stage, msg.value)
    pending.delete(msg.id)
    if (msg.type === 'error') p.reject(new Error(msg.message))
    else if (msg.type === 'loaded') (p.resolve as (v: Loaded) => void)({ mesh: msg.mesh, vertices: msg.vertices, nonManifold: msg.nonManifold })
    else (p.resolve as (v: CandidatesResult) => void)({ candidates: msg.candidates, ms: msg.ms })
  }
  w.onerror = (e) => {
    e.preventDefault()
    reset(new Error('The geometry worker stopped unexpectedly. Load the part again.'))
  }
  worker = w
  return w
}

function request<T>(msg: WorkerIn, transfer: Transferable[], onProgress?: Pending['onProgress']): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.set(msg.id, { kind: msg.type, resolve: resolve as Pending['resolve'], reject, onProgress })
    getWorker().postMessage(msg, transfer)
  })
}

/** Parse + index in the worker. The buffer is transferred, so the caller must not reuse it. */
export function loadInWorker(buffer: ArrayBuffer, onProgress: (stage: Stage, value: number) => void): Promise<Loaded> {
  // A new load supersedes one still running: kill the worker instead of waiting out a 100 MB parse.
  if ([...pending.values()].some((p) => p.kind === 'load')) reset(new CancelledError('Superseded by a newer file.'))
  return request({ type: 'load', id: nextId++, buffer }, [buffer], onProgress)
}

export function candidatesInWorker(thresholdDeg: number): Promise<CandidatesResult> {
  return request({ type: 'candidates', id: nextId++, thresholdDeg }, [])
}
