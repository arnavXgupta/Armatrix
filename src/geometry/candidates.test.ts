import { describe, expect, test } from 'vitest'
import { findCandidates } from './candidates'
import { box, cube, lBracket, prism, raw, type Tri } from './fixtures'
import { buildEdges, mergeVertices } from './topology'
import type { Candidate } from './types'

const analyse = (tris: Tri[]) => {
  const mesh = mergeVertices(raw(tris))
  const edges = buildEdges(mesh)
  return { mesh, edges, find: (deg = 30, minLength = 0) => findCandidates(mesh, edges, deg, minLength) }
}
const count = (angles: Float32Array, deg: number) => angles.filter((a) => Math.abs(a - deg) < 1e-3).length
const total = (cs: Candidate[]) => cs.reduce((s, c) => s + c.length, 0)
const expectUnitNormals = (cs: Candidate[]) => {
  for (const c of cs) {
    expect(c.normals.length).toBe(c.points.length)
    for (const n of c.normals) expect(Math.hypot(...n)).toBeCloseTo(1, 5)
  }
}

describe('topology', () => {
  test('cube merges to 8 vertices and 18 edges: 12 at 90°, 6 diagonals at 0°', () => {
    const { mesh, edges } = analyse(cube())
    expect(mesh.vertices).toBe(8)
    expect(mesh.triangles).toBe(12)
    expect(edges.count).toBe(18)
    expect(count(edges.angle, 90)).toBe(12)
    expect(count(edges.angle, 0)).toBe(6)
    expect(edges.nonManifold).toBe(0)
  })

  test('duplicated triangle is removed', () => {
    const tris = cube()
    const { mesh, edges } = analyse([...tris, tris[3], [tris[5][0], tris[5][2], tris[5][1]]])
    expect(mesh.triangles).toBe(12)
    expect(edges.count).toBe(18)
    expect(edges.nonManifold).toBe(0)
  })

  test('a triangle with flipped winding does not create a false crease', () => {
    const tris = cube()
    tris[0] = [tris[0][0], tris[0][2], tris[0][1]]
    const { edges } = analyse(tris)
    expect(count(edges.angle, 90)).toBe(12)
    expect(count(edges.angle, 0)).toBe(6)
  })
})

describe('findCandidates', () => {
  test('cube at 30°: 12 unit-length chains split at the corners', () => {
    const cs = analyse(cube()).find(30)
    expect(cs).toHaveLength(12)
    expect(total(cs)).toBeCloseTo(12)
    for (const c of cs) expect(c).toMatchObject({ closed: false, kind: 'crease' })
    expectUnitNormals(cs)
  })

  test('threshold sweep: 89° keeps the 12 edges, 91° keeps none', () => {
    const { find } = analyse(cube())
    expect(find(89)).toHaveLength(12)
    expect(find(91)).toHaveLength(0)
  })

  test('open box rim is one closed boundary loop of length 4', () => {
    const cs = analyse(box([0, 0, 0], [1, 1, 1], true)).find(91)
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ closed: true, kind: 'boundary' })
    expect(cs[0].points).toHaveLength(4)
    expect(cs[0].length).toBeCloseTo(4)
  })

  test('single quad: diagonal ignored, rim is one closed loop', () => {
    const q: Tri[] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      [
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    ]
    const cs = analyse(q).find(30)
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ closed: true, kind: 'boundary' })
    expect(cs[0].length).toBeCloseTo(4)
    expectUnitNormals(cs)
  })

  test('L-bracket inner corner normal bisects the two walls', () => {
    const cs = analyse(lBracket()).find(30)
    const inner = cs.find((c) => c.points.every((p) => p[0] === 1 && p[1] === 1))!
    expect(inner).toBeDefined()
    expect(inner.meanAngleDeg).toBeCloseTo(90)
    for (const n of inner.normals) expect((n[0] + n[1]) / Math.SQRT2).toBeGreaterThan(0.99)
  })

  test('two cubes touching along one edge: no throw, edge flagged, candidates found', () => {
    const { edges, find } = analyse([...cube(), ...box([1, 1, 0], [2, 2, 1])])
    expect(edges.nonManifold).toBe(1)
    expect(find(30).length).toBeGreaterThanOrEqual(23)
  })

  test('short chains are dropped; ids follow length order', () => {
    const tris = [...box([0, 0, 0], [10, 1, 1]), ...box([20, 0, 0], [20.1, 0.1, 0.1])]
    const cs = analyse(tris).find(30, 0.5)
    expect(cs.every((c) => c.length >= 0.5)).toBe(true)
    expect(cs.map((c) => c.id)).toEqual(cs.map((_, i) => i))
    expect(cs[0].length).toBeCloseTo(10)
  })

  test('faceted cylinder: facet edges appear only below the facet angle', () => {
    const n = 24 // 15° between facets
    const poly = Array.from({ length: n }, (_, i): [number, number] => [Math.cos((i / n) * 2 * Math.PI), Math.sin((i / n) * 2 * Math.PI)])
    const cap = Array.from({ length: n - 2 }, (_, i): [number, number, number] => [0, i + 1, i + 2])
    const { find } = analyse(prism(poly, cap, 0, 3))
    const at30 = find(30)
    expect(at30).toHaveLength(2) // top and bottom rims as closed loops
    expect(at30.every((c) => c.closed && c.points.length === n)).toBe(true)
    expect(find(10).length).toBeGreaterThan(2)
  })
})
