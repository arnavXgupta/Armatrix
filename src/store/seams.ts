import { defaultParams } from '../export/defaults'
import type { WeldParams } from '../export/schema'
import type { Candidate, Vec3 } from '../geometry/types'

export type Seam = {
  id: string
  name: string // 'S-01' …, editable
  source: 'auto' | 'manual'
  points: Vec3[] // raw part coordinates, in weld direction; a closed seam does not repeat points[0]
  normals: Vec3[] // unit, per point (torch approach)
  closed: boolean
  length: number // part units, including the closing segment of a loop
  params: WeldParams
  notes?: string
}

export const seamName = (n: number) => `S-${String(n).padStart(2, '0')}`

/** uuid v4. crypto.randomUUID is missing on plain-http LAN addresses, so fall back to getRandomValues. */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15
    return (c === 'x' ? r : (r & 3) | 8).toString(16)
  })

const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

export function polylineLength(points: Vec3[], closed: boolean): number {
  let len = 0
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i])
  if (closed && points.length > 2) len += dist(points[points.length - 1], points[0])
  return len
}

/** A closed loop starts at its lowest point (min Z, then min X): deterministic, and robots start low. */
function startAtLowest(points: Vec3[], normals: Vec3[]) {
  let best = 0
  for (let i = 1; i < points.length; i++) {
    const p = points[i], b = points[best]
    if (p[2] < b[2] || (p[2] === b[2] && p[0] < b[0])) best = i
  }
  return { points: [...points.slice(best), ...points.slice(0, best)], normals: [...normals.slice(best), ...normals.slice(0, best)] }
}

export function seamFromCandidate(c: Candidate, id: string, name: string, params: WeldParams = defaultParams()): Seam {
  const { points, normals } = c.closed ? startAtLowest(c.points, c.normals) : { points: c.points, normals: c.normals }
  return { id, name, source: 'auto', points, normals, closed: c.closed, length: c.length, params }
}

export function seamFromPoints(points: Vec3[], normals: Vec3[], closed: boolean, id: string, name: string, params: WeldParams = defaultParams()): Seam {
  return { id, name, source: 'manual', points, normals, closed, length: polylineLength(points, closed), params }
}

/**
 * Attach a polyline (a candidate) to whichever end of the seam it touches, keeping the seam's
 * direction. Null when the seam is closed or no pair of ends is within tol. If the result's
 * ends meet, it becomes a closed loop.
 */
export function joinSeam(seam: Seam, pts: Vec3[], nrm: Vec3[], tol: number): Seam | null {
  if (seam.closed || pts.length < 2) return null
  const s0 = seam.points[0], s1 = seam.points[seam.points.length - 1]
  const c0 = pts[0], c1 = pts[pts.length - 1]
  const rp = [...pts].reverse(), rn = [...nrm].reverse()
  let points: Vec3[], normals: Vec3[]
  if (dist(s1, c0) <= tol) [points, normals] = [[...seam.points, ...pts.slice(1)], [...seam.normals, ...nrm.slice(1)]]
  else if (dist(s1, c1) <= tol) [points, normals] = [[...seam.points, ...rp.slice(1)], [...seam.normals, ...rn.slice(1)]]
  else if (dist(c1, s0) <= tol) [points, normals] = [[...pts, ...seam.points.slice(1)], [...nrm, ...seam.normals.slice(1)]]
  else if (dist(c0, s0) <= tol) [points, normals] = [[...rp, ...seam.points.slice(1)], [...rn, ...seam.normals.slice(1)]]
  else return null
  const closed = points.length > 3 && dist(points[0], points[points.length - 1]) <= tol
  if (closed) {
    points.pop()
    normals.pop()
  }
  return { ...seam, points, normals, closed, length: polylineLength(points, closed) }
}

/** Reverse the weld direction. A loop keeps its start point and runs the other way round. */
export function flipSeam(seam: Seam): Seam {
  const flip = <T,>(a: T[]) => (seam.closed ? [a[0], ...a.slice(1).reverse()] : [...a].reverse())
  return { ...seam, points: flip(seam.points), normals: flip(seam.normals) }
}

/**
 * Which seam owns each candidate. Matched by geometry, not ids: candidate ids change with the
 * threshold, and restored or imported seams carry rounded coordinates. A candidate belongs to a
 * seam when its first segment is one of the seam's segments (both ends within eps; both are mesh
 * edges, so this is exact up to rounding). Midpoints alone are not enough: a 0–200 edge and a
 * 95–105 edge on the same line share a midpoint. Grid hash on segment midpoints with a 27-cell
 * neighbourhood, so it stays linear in the point count.
 */
export function seamOwners(candidates: Candidate[], seams: Seam[], eps: number): Map<number, string> {
  const owners = new Map<number, string>()
  if (!seams.length || !candidates.length || !(eps > 0)) return owners
  const cell = eps * 4
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  const grid = new Map<string, { m: Vec3; a: Vec3; b: Vec3; id: string }[]>()
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  for (const s of seams) {
    if (s.source !== 'auto') continue
    const n = s.points.length
    for (let i = 0; i < n - 1 + (s.closed ? 1 : 0); i++) {
      const a = s.points[i], b = s.points[(i + 1) % n]
      const m = mid(a, b)
      const k = key(Math.floor(m[0] / cell), Math.floor(m[1] / cell), Math.floor(m[2] / cell))
      const list = grid.get(k)
      if (list) list.push({ m, a, b, id: s.id })
      else grid.set(k, [{ m, a, b, id: s.id }])
    }
  }
  for (const c of candidates) {
    if (c.points.length < 2) continue
    const [ca, cb] = c.points
    const m = mid(ca, cb)
    const gx = Math.floor(m[0] / cell), gy = Math.floor(m[1] / cell), gz = Math.floor(m[2] / cell)
    search: for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const e of grid.get(key(gx + dx, gy + dy, gz + dz)) ?? [])
            if (dist(e.m, m) <= eps && ((dist(e.a, ca) <= eps && dist(e.b, cb) <= eps) || (dist(e.a, cb) <= eps && dist(e.b, ca) <= eps))) {
              owners.set(c.id, e.id)
              break search
            }
  }
  return owners
}
