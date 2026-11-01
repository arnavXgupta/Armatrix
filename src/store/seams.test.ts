import { describe, expect, test } from 'vitest'
import type { Candidate, Vec3 } from '../geometry/types'
import { flipSeam, joinSeam, polylineLength, samplePath, seamFromCandidate, seamFromPoints, seamName, seamOwners } from './seams'

const up: Vec3 = [0, 0, 1]
const cand = (id: number, points: Vec3[], closed = false): Candidate => ({
  id,
  points,
  normals: points.map(() => up),
  length: polylineLength(points, closed),
  closed,
  kind: 'crease',
  meanAngleDeg: 90,
})
const line = (...pts: Vec3[]) => seamFromPoints(pts, pts.map(() => up), false, 'x', 'S-01')

describe('seam helpers', () => {
  test('a closed loop starts at its lowest point (min Z, then min X); open keeps candidate order', () => {
    const loop = cand(0, [[5, 0, 3], [5, 5, 1], [0, 5, 1], [0, 0, 2]], true)
    expect(seamFromCandidate(loop, 'a', 'S-01').points[0]).toEqual([0, 5, 1])
    const open = cand(1, [[3, 0, 0], [0, 0, 0]])
    expect(seamFromCandidate(open, 'b', 'S-02').points).toEqual(open.points)
  })

  test('join: all four end pairings keep the seam direction; length is the sum', () => {
    const seam = line([0, 0, 0], [1, 0, 0])
    const ext: Vec3[] = [[1, 0, 0], [2, 0, 0]]
    const tol = 1e-6
    expect(joinSeam(seam, ext, ext.map(() => up), tol)!.points).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 0]]) // end → start
    expect(joinSeam(seam, [...ext].reverse(), ext.map(() => up), tol)!.points).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 0]]) // end → end
    const before: Vec3[] = [[-1, 0, 0], [0, 0, 0]]
    expect(joinSeam(seam, before, before.map(() => up), tol)!.points).toEqual([[-1, 0, 0], [0, 0, 0], [1, 0, 0]]) // start ← end
    const joined = joinSeam(seam, [...before].reverse(), before.map(() => up), tol)! // start ← start
    expect(joined.points).toEqual([[-1, 0, 0], [0, 0, 0], [1, 0, 0]])
    expect(joined.length).toBeCloseTo(2)
  })

  test('join: not touching → null; closing the ends makes a loop; closed seams refuse', () => {
    const seam = line([0, 0, 0], [1, 0, 0], [1, 1, 0])
    expect(joinSeam(seam, [[5, 5, 5], [6, 6, 6]], [up, up], 0.01)).toBeNull()
    const loop = joinSeam(seam, [[1, 1, 0], [0, 1, 0], [0, 0, 0]], [up, up, up], 0.01)!
    expect(loop.closed).toBe(true)
    expect(loop.points).toHaveLength(4)
    expect(loop.length).toBeCloseTo(4)
    expect(joinSeam(loop, [[0, 0, 0], [0, 0, 1]], [up, up], 0.01)).toBeNull()
  })

  test('flip reverses an open seam; a loop keeps its start; length unchanged', () => {
    const open = line([0, 0, 0], [1, 0, 0], [3, 0, 0])
    expect(flipSeam(open).points).toEqual([[3, 0, 0], [1, 0, 0], [0, 0, 0]])
    expect(flipSeam(open).length).toBe(open.length)
    const loop = seamFromPoints([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], Array(4).fill(up), true, 'l', 'S-02')
    expect(flipSeam(loop).points).toEqual([[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]])
    expect(flipSeam(loop).length).toBeCloseTo(4)
  })

  test('seamName pads to two digits', () => {
    expect(seamName(4)).toBe('S-04')
    expect(seamName(123)).toBe('S-123')
  })

  test('seamOwners matches candidates to seams by geometry, tolerating rounding', () => {
    const a = cand(0, [[0, 0, 0], [10, 0, 0]])
    const b = cand(1, [[10, 0, 0], [10, 10, 0]])
    const c = cand(2, [[0, 0, 0], [0, 10, 0]])
    const seam = { ...seamFromCandidate(a, 'A', 'S-01') }
    const joined = joinSeam(seam, b.points, b.normals, 1e-6)!
    // what comes back after an export/import round trip: coordinates off by ~1e-7
    const rounded = { ...joined, points: joined.points.map((p) => p.map((v) => v + 1e-7) as Vec3) }
    const owners = seamOwners([a, b, c], [rounded], 1e-4)
    expect(owners.get(0)).toBe('A')
    expect(owners.get(1)).toBe('A')
    expect(owners.has(2)).toBe(false)
  })

  test('seamOwners: a longer collinear edge with the same midpoint is not owned', () => {
    const short = cand(0, [[95, 0, 10], [105, 0, 10]])
    const long = cand(1, [[0, 0, 10], [200, 0, 10]])
    const owners = seamOwners([short, long], [seamFromCandidate(short, 'S', 'S-01')], 1e-4)
    expect(owners.get(0)).toBe('S')
    expect(owners.has(1)).toBe(false)
  })
})

describe('samplePath', () => {
  test('even spacing along an L, ends included, normals interpolated and unit length', () => {
    const pts: Vec3[] = [[0, 0, 0], [10, 0, 0], [10, 10, 0]]
    const seam = { points: pts, normals: [up, up, [1, 0, 0] as Vec3], closed: false }
    const s = samplePath(seam, 5)
    expect(s.map((x) => x.p)).toEqual([[0, 0, 0], [5, 0, 0], [10, 0, 0], [10, 5, 0], [10, 10, 0]])
    expect(s[4].n).toEqual([1, 0, 0])
    expect(s[3].n[0]).toBeCloseTo(Math.SQRT1_2)
    for (const x of s) expect(Math.hypot(...x.n)).toBeCloseTo(1)
  })

  test('a loop is sampled all the way round without repeating its start', () => {
    const sq: Vec3[] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]
    const s = samplePath({ points: sq, normals: sq.map(() => up), closed: true }, 4)
    expect(s.map((x) => x.p)).toEqual(sq)
  })
})
