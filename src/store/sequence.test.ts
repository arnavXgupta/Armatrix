import { describe, expect, test } from 'vitest'
import type { Vec3 } from '../geometry/types'
import { seamFromPoints, type Seam } from './seams'
import { airMoves, airTravel, entry, exit, orderByNearest } from './sequence'

const up: Vec3 = [0, 0, 1]
const seam = (id: string, pts: Vec3[], closed = false): Seam => seamFromPoints(pts, pts.map(() => up), closed, id, id)
const ids = (seams: Seam[]) => seams.map((s) => s.id)

// Along X: the optimal order is a, b, c (flipped: it is drawn 30 → 22), d.
const a = seam('a', [[0, 0, 0], [10, 0, 0]])
const b = seam('b', [[12, 0, 0], [20, 0, 0]])
const c = seam('c', [[30, 0, 0], [22, 0, 0]])
const d = seam('d', [[32, 0, 0], [40, 0, 0]])
const loop = seam('loop', [[50, 0, 0], [60, 0, 0], [60, 10, 0]], true)

describe('air moves', () => {
  test('one move per gap, from each exit to the next entry', () => {
    const moves = airMoves([a, c, b])
    expect(moves).toEqual([
      { from: [10, 0, 0], to: [30, 0, 0], length: 20 },
      { from: [22, 0, 0], to: [12, 0, 0], length: 10 },
    ])
    expect(airTravel([a, c, b])).toBe(30)
  })

  test('a loop exits where it entered', () => {
    expect(exit(loop)).toEqual(entry(loop))
    expect(airMoves([loop, d])[0].length).toBe(18)
  })

  test('0 and 1 seams have no air travel', () => {
    expect(airMoves([])).toEqual([])
    expect(airTravel([a])).toBe(0)
  })
})

describe('orderByNearest', () => {
  test('a pick order of a, c, b, d becomes a, b, c, d with c flipped', () => {
    const out = orderByNearest([a, c, b, d])
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd'])
    expect(out[2].points).toEqual([[22, 0, 0], [30, 0, 0]])
    expect(airTravel([a, c, b, d])).toBe(42)
    expect(airTravel(out)).toBe(6)
  })

  test('the first seam stays first, in its own direction', () => {
    const out = orderByNearest([d, a, b])
    expect(out[0]).toBe(d)
  })

  test('loops are never flipped', () => {
    const out = orderByNearest([d, loop])
    expect(out[1].points).toEqual(loop.points)
  })

  test('0, 1 and 2 seams', () => {
    expect(orderByNearest([])).toEqual([])
    expect(orderByNearest([a])).toEqual([a])
    expect(orderByNearest([b, c])[1].points[0]).toEqual([22, 0, 0])
  })

  test('stable: the optimal order comes back unchanged, and a second run changes nothing', () => {
    const once = orderByNearest([a, c, b, d])
    expect(orderByNearest(once)).toEqual(once)
  })

  test('on random sets it almost never makes air travel longer than the input order', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 100
    let notWorse = 0
    for (let t = 0; t < 100; t++) {
      const seams = Array.from({ length: 20 }, (_, i) => seam(`s${i}`, [[rand(), rand(), rand()], [rand(), rand(), rand()]]))
      if (airTravel(orderByNearest(seams)) <= airTravel(seams)) notWorse++
    }
    expect(notWorse).toBeGreaterThanOrEqual(95)
  })
})
