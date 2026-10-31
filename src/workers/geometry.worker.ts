import { findCandidates } from '../geometry/candidates'
import { makeContactTest } from '../geometry/contact'
import { bboxDiagonal, parseStl } from '../geometry/parseStl'
import { buildEdges, mergeVertices } from '../geometry/topology'
import type { EdgeTable, IndexedMesh } from '../geometry/types'
import type { WorkerIn, WorkerOut } from './geometryClient'

// The indexed mesh and edge table stay here, so a threshold change only sends a number.
let current: { mesh: IndexedMesh; edges: EdgeTable; minLength: number; inContact: (face: number) => boolean } | null = null

const post = (msg: WorkerOut, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(m: WorkerOut, t: Transferable[]): void }).postMessage(msg, transfer)

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data
  try {
    if (msg.type === 'load') {
      const raw = parseStl(msg.buffer, (value) => post({ type: 'progress', id: msg.id, stage: 'parse', value }))
      post({ type: 'progress', id: msg.id, stage: 'index', value: 0 })
      const mesh = mergeVertices(raw)
      const edges = buildEdges(mesh)
      const diag = bboxDiagonal(raw.bbox)
      current = { mesh, edges, minLength: diag * 0.005, inContact: makeContactTest(mesh, diag) } // only replaced on success
      post({ type: 'loaded', id: msg.id, mesh: raw, vertices: mesh.vertices, nonManifold: edges.nonManifold }, [raw.positions.buffer as ArrayBuffer])
    } else {
      if (!current) throw new Error('No part is loaded in the geometry worker.')
      const t = performance.now()
      const candidates = findCandidates(current.mesh, current.edges, msg.thresholdDeg, current.minLength, current.inContact)
      post({ type: 'candidates', id: msg.id, candidates, ms: performance.now() - t })
    }
  } catch (err) {
    const message =
      err instanceof RangeError
        ? 'This part is too large for the browser to hold in memory.'
        : err instanceof Error
          ? err.message
          : String(err)
    post({ type: 'error', id: msg.id, message })
  }
}
