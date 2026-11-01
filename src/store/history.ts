import type { Seam } from './seams'

/** What undo restores. Hover, mode, camera, units and the job fields are not history. */
export type Snapshot = { seams: Seam[]; selectedSeamId: string | null; seamCounter: number }
export type History = { past: Snapshot[]; future: Snapshot[] }

export const HISTORY_LIMIT = 50
export const EMPTY_HISTORY: History = { past: [], future: [] }

/** Before an edit: remember the current state, drop the oldest past the limit, forget the redo branch. */
export const record = (h: History, current: Snapshot): History => ({ past: [...h.past, current].slice(-HISTORY_LIMIT), future: [] })

/** Undo: the last past snapshot comes back and the current one goes onto future. Null when there is nothing to undo. */
export function undo(h: History, current: Snapshot): { history: History; snapshot: Snapshot } | null {
  const snapshot = h.past.at(-1)
  return snapshot ? { snapshot, history: { past: h.past.slice(0, -1), future: [...h.future, current] } } : null
}

/** Redo: the mirror of undo. */
export function redo(h: History, current: Snapshot): { history: History; snapshot: Snapshot } | null {
  const snapshot = h.future.at(-1)
  return snapshot ? { snapshot, history: { past: [...h.past, current], future: h.future.slice(0, -1) } } : null
}
