import { tupleIndex } from './topology'
import type { IndexedMesh } from './types'

/**
 * Which faces are pressed against another body's face: same plane, opposite normal, overlapping.
 *
 * Weldments usually arrive as separate bodies: a web plate stands on a base plate, and the seam we
 * detect is the web's own bottom edge. That edge's faces are the web side (+x) and the web bottom
 * (−z), so their bisector points down into the base plate. The torch actually approaches between
 * the web side and the base plate's top (+z), i.e. the contact face's normal negated.
 *
 * Triangles are bucketed by quantised plane (normal to 0.01, offset to bboxDiag × 1e-5), so a test
 * only looks at triangles on the one opposite plane. Results are cached per face.
 */
export function makeContactTest(mesh: IndexedMesh, diag: number): (face: number) => boolean {
  const { indices, faceNormals: fn, positions: P, triangles } = mesh
  const dq = Math.max(diag * 1e-5, 1e-9)
  const nq = (v: number) => Math.round(v * 100)
  const planeKey = (t: number, sign: 1 | -1): [number, number, number] => {
    const nx = sign * fn[t * 3], ny = sign * fn[t * 3 + 1], nz = sign * fn[t * 3 + 2]
    const v = indices[t * 3] * 3
    const d = nx * P[v] + ny * P[v + 1] + nz * P[v + 2]
    return [(nq(nx) + 128) * 256 + (nq(ny) + 128), nq(nz), Math.round(d / dq)]
  }

  // plane id per triangle, then triangles grouped by plane (compressed rows)
  const planes = tupleIndex(triangles)
  const planeOf = new Int32Array(triangles)
  for (let t = 0; t < triangles; t++) planeOf[t] = planes.idOf(...planeKey(t, 1))
  const start = new Int32Array(planes.size + 1)
  for (let t = 0; t < triangles; t++) start[planeOf[t] + 1]++
  for (let i = 0; i < planes.size; i++) start[i + 1] += start[i]
  const cursor = start.slice(0, planes.size)
  const byPlane = new Int32Array(triangles)
  for (let t = 0; t < triangles; t++) byPlane[cursor[planeOf[t]]++] = t

  const cache = new Int8Array(triangles) // 0 unknown, 1 contact, 2 free
  const tol = dq * 10

  /** Is point q inside triangle t (q already lies in t's plane, give or take tol)? */
  const inside = (t: number, qx: number, qy: number, qz: number) => {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3
    const v0x = P[c] - P[a], v0y = P[c + 1] - P[a + 1], v0z = P[c + 2] - P[a + 2]
    const v1x = P[b] - P[a], v1y = P[b + 1] - P[a + 1], v1z = P[b + 2] - P[a + 2]
    const v2x = qx - P[a], v2y = qy - P[a + 1], v2z = qz - P[a + 2]
    const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z
    const d11 = v1x * v1x + v1y * v1y + v1z * v1z, d20 = v2x * v0x + v2y * v0y + v2z * v0z
    const d21 = v2x * v1x + v2y * v1y + v2z * v1z
    const den = d00 * d11 - d01 * d01
    if (!(den > 0)) return false
    const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den
    const e = 1e-6
    return u >= -e && v >= -e && u + v <= 1 + e
  }

  return (f: number) => {
    if (f < 0) return false
    if (cache[f]) return cache[f] === 1
    // a point well inside face f (its centroid) must lie on a triangle of the opposite plane
    const a = indices[f * 3] * 3, b = indices[f * 3 + 1] * 3, c = indices[f * 3 + 2] * 3
    const qx = (P[a] + P[b] + P[c]) / 3, qy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, qz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3
    const [k0, k1, k2] = planeKey(f, -1)
    let hit = false
    search: for (const dk of [0, -1, 1]) {
      const id = planes.find(k0, k1, k2 + dk)
      if (id < 0) continue
      for (let i = start[id]; i < start[id + 1]; i++) {
        const t = byPlane[i]
        const nx = fn[t * 3], ny = fn[t * 3 + 1], nz = fn[t * 3 + 2]
        const v = indices[t * 3] * 3
        const dist = nx * (qx - P[v]) + ny * (qy - P[v + 1]) + nz * (qz - P[v + 2])
        if (Math.abs(dist) <= tol && inside(t, qx, qy, qz)) {
          hit = true
          break search
        }
      }
    }
    cache[f] = hit ? 1 : 2
    return hit
  }
}
