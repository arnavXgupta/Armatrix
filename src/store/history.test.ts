import { describe, expect, test } from 'vitest'
import { EMPTY_HISTORY, HISTORY_LIMIT, record, redo, undo, type Snapshot } from './history'

const snap = (n: number): Snapshot => ({ seams: [], selectedSeamId: `s${n}`, seamCounter: n })

describe('history', () => {
  test('record keeps the last 50 and drops the oldest', () => {
    let h = EMPTY_HISTORY
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = record(h, snap(i))
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0].seamCounter).toBe(5)
    expect(h.past.at(-1)!.seamCounter).toBe(HISTORY_LIMIT + 4)
  })

  test('undo returns the last snapshot and puts the current one on future; redo reverses it', () => {
    const h = record(record(EMPTY_HISTORY, snap(1)), snap(2))
    const u = undo(h, snap(3))!
    expect(u.snapshot.seamCounter).toBe(2)
    expect(u.history).toEqual({ past: [snap(1)], future: [snap(3)] })
    const r = redo(u.history, u.snapshot)!
    expect(r.snapshot.seamCounter).toBe(3)
    expect(r.history).toEqual({ past: [snap(1), snap(2)], future: [] })
  })

  test('a new edit after undo clears the redo branch', () => {
    const u = undo(record(EMPTY_HISTORY, snap(1)), snap(2))!
    expect(u.history.future).toHaveLength(1)
    expect(record(u.history, u.snapshot).future).toEqual([])
  })

  test('undo and redo with nothing to do return null', () => {
    expect(undo(EMPTY_HISTORY, snap(1))).toBeNull()
    expect(redo(EMPTY_HISTORY, snap(1))).toBeNull()
  })
})
