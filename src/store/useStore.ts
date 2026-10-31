import { create } from 'zustand'
import { guessUnits, type Units } from '../geometry/parseStl'
import type { Bbox, Candidate, RawMesh } from '../geometry/types'
import { CancelledError, candidatesInWorker, loadInWorker, workerEpoch } from '../workers/geometryClient'

export const MAX_FILE_BYTES = 250 * 1024 * 1024

export type Part = {
  name: string
  sizeBytes: number
  sha256: string // '' when the page is not a secure context (no crypto.subtle)
  format: RawMesh['format']
  triangles: number
  dropped: number
  vertices: number
  nonManifold: number
  bbox: Bbox
  units: Units
  unitsGuessed: boolean
}
export type Status = { kind: 'idle' | 'loading' | 'ready' | 'error'; message: string; progress?: number }
type Ui = { wireframe: boolean; ortho: boolean; showCandidates: boolean; angleThreshold: number }
type Toggle = 'wireframe' | 'ortho' | 'showCandidates'

type Store = {
  part: Part | null
  mesh: RawMesh | null // not persisted; plan 06 persists the file bytes instead
  candidates: Candidate[]
  candidatesDeg: number | null // threshold the current candidates were computed at; null until the first result
  candidatesMs: number | null
  status: Status
  ui: Ui
  loadFile(file: File): Promise<void>
  clearPart(): void
  setUnits(units: 'mm' | 'in'): void
  toggle(key: Toggle): void
  setThreshold(deg: number): void
}

export const IDLE: Status = { kind: 'idle', message: 'Drop an .stl into the viewport to start.' }
const READY: Status = { kind: 'ready', message: '' }

let loadSeq = 0 // only the newest load may write to the store
let candSeq = 0 // only the newest candidates request may write
let partEpoch = -1 // worker epoch the current part was indexed in
let thresholdTimer: ReturnType<typeof setTimeout> | undefined

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) return ''
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const useStore = create<Store>()((set, get) => {
  const fail = (message: string) => set({ status: { kind: 'error', message } })
  // If the worker was replaced since this part loaded, it no longer holds the part's edges.
  const dropPartIfOrphaned = () => {
    if (get().part && workerEpoch() !== partEpoch) set({ part: null, mesh: null, candidates: [], candidatesDeg: null, candidatesMs: null })
  }

  async function refreshCandidates() {
    const seq = ++candSeq
    const deg = get().ui.angleThreshold
    try {
      const { candidates, ms } = await candidatesInWorker(deg)
      if (seq !== candSeq) return
      set({ candidates, candidatesDeg: deg, candidatesMs: ms, ...(get().status.kind === 'error' ? { status: READY } : {}) })
    } catch (e) {
      if (seq !== candSeq || e instanceof CancelledError) return
      dropPartIfOrphaned()
      fail(`Could not compute candidate seams. ${errorText(e)}`)
    }
  }

  return {
    part: null,
    mesh: null,
    candidates: [],
    candidatesDeg: null,
    candidatesMs: null,
    status: IDLE,
    ui: { wireframe: false, ortho: false, showCandidates: true, angleThreshold: 30 },

    async loadFile(file) {
      const seq = ++loadSeq
      if (!/\.stl$/i.test(file.name)) return fail(`${file.name} is not an .stl file. Choose an .stl part.`)
      if (file.size === 0) return fail(`${file.name} is empty.`)
      if (file.size > MAX_FILE_BYTES) {
        return fail(`${file.name} is ${Math.round(file.size / 1048576)} MB. The limit is 250 MB; decimate the mesh and try again.`)
      }
      set({ status: { kind: 'loading', message: `Reading ${file.name}`, progress: 0 } })
      try {
        const buffer = await file.arrayBuffer()
        const sha256 = await sha256Hex(buffer) // before the buffer is transferred to the worker
        if (seq !== loadSeq) return
        const { mesh, vertices, nonManifold } = await loadInWorker(buffer, (stage, value) => {
          if (seq !== loadSeq) return
          const status: Status =
            stage === 'parse'
              ? { kind: 'loading', message: `Parsing ${file.name}`, progress: 0.05 + value * 0.6 }
              : { kind: 'loading', message: `Finding edges in ${file.name}`, progress: 0.7 }
          set({ status })
        })
        if (seq !== loadSeq) return
        partEpoch = workerEpoch()
        const units = guessUnits(mesh.bbox)
        set({
          part: {
            name: file.name,
            sizeBytes: file.size,
            sha256,
            format: mesh.format,
            triangles: mesh.triangles,
            dropped: mesh.dropped,
            vertices,
            nonManifold,
            bbox: mesh.bbox,
            units,
            unitsGuessed: true,
          },
          mesh,
          candidates: [],
          candidatesDeg: null,
          candidatesMs: null,
          status: READY,
        })
        await refreshCandidates()
      } catch (e) {
        if (seq !== loadSeq || e instanceof CancelledError) return
        dropPartIfOrphaned() // otherwise the previous part stays: a bad drop never costs work
        fail(`Could not open ${file.name}. ${errorText(e)}`)
      }
    },

    clearPart() {
      loadSeq++
      candSeq++
      clearTimeout(thresholdTimer)
      set({ part: null, mesh: null, candidates: [], candidatesDeg: null, candidatesMs: null, status: IDLE })
    },

    setUnits(units) {
      const part = get().part
      if (part) set({ part: { ...part, units, unitsGuessed: false } })
    },

    toggle(key) {
      set({ ui: { ...get().ui, [key]: !get().ui[key] } })
    },

    setThreshold(deg) {
      set({ ui: { ...get().ui, angleThreshold: deg } })
      clearTimeout(thresholdTimer)
      if (get().part) thresholdTimer = setTimeout(refreshCandidates, 80)
    },
  }
})
