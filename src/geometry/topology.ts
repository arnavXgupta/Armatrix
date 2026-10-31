import { bboxDiagonal } from './parseStl'
import type { EdgeTable, IndexedMesh, RawMesh } from './types'

/**
 * Open-addressing hash from an integer triple to a dense id (0, 1, 2, …).
 * Typed arrays only: a Map with string keys is several times slower at 1.5M+ keys.
 */
export function tupleIndex(maxItems: number) {
  let cap = 16
  while (cap < maxItems * 2) cap *= 2 // load factor <= 0.5
  const mask = cap - 1
  const table = new Int32Array(cap).fill(-1)
  const keys = new Int32Array(maxItems * 3)
  let size = 0
  return {
    get size() {
      return size
    },
    /** Id of (a, b, c), or -1 if it was never inserted. */
    find(a: number, b: number, c: number): number {
      let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ Math.imul(c, 0xc2b2ae3d)
      h = (h ^ (h >>> 15)) & mask
      for (;;) {
        const id = table[h]
        if (id === -1) return -1
        if (keys[id * 3] === a && keys[id * 3 + 1] === b && keys[id * 3 + 2] === c) return id
        h = (h + 1) & mask
      }
    },
    /** Id of (a, b, c), inserting it if new. */
    idOf(a: number, b: number, c: number): number {
      let h = Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ Math.imul(c, 0xc2b2ae3d)
      h = (h ^ (h >>> 15)) & mask
      for (;;) {
        const id = table[h]
        if (id === -1) {
          table[h] = size
          keys[size * 3] = a
          keys[size * 3 + 1] = b
          keys[size * 3 + 2] = c
          return size++
        }
        if (keys[id * 3] === a && keys[id * 3 + 1] === b && keys[id * 3 + 2] === c) return id
        h = (h + 1) & mask
      }
    },
  }
}

/**
 * Weld coincident vertices (quantised to bboxDiagonal × 1e-6), then drop triangles that
 * collapsed and exact duplicates (same three vertices, either winding).
 */
export function mergeVertices(raw: RawMesh): IndexedMesh {
  const p = raw.positions
  const nv = p.length / 3
  const [mx, my, mz] = raw.bbox.min
  const tol = Math.max(bboxDiagonal(raw.bbox) * 1e-6, 1e-6)
  // ponytail: grid snapping, so two points straddling a cell boundary stay apart. Fine for STL
  // exports, where shared corners are bit-identical; check neighbour cells if scans need it.
  const verts = tupleIndex(nv)
  const remap = new Uint32Array(nv)
  const positions = new Float32Array(nv * 3)
  for (let v = 0; v < nv; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2]
    const before = verts.size
    const id = verts.idOf(Math.round((x - mx) / tol), Math.round((y - my) / tol), Math.round((z - mz) / tol))
    if (id === before) {
      positions[id * 3] = x
      positions[id * 3 + 1] = y
      positions[id * 3 + 2] = z
    }
    remap[v] = id
  }

  const tris = tupleIndex(raw.triangles)
  const indices = new Uint32Array(raw.triangles * 3)
  const faceNormals = new Float32Array(raw.triangles * 3)
  let kept = 0
  for (let t = 0; t < raw.triangles; t++) {
    const a = remap[t * 3], b = remap[t * 3 + 1], c = remap[t * 3 + 2]
    if (a === b || b === c || a === c) continue
    // sorted triple as the duplicate key
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi
    const before = tris.size
    if (tris.idOf(lo, mid, hi) !== before) continue
    if (!faceNormal(positions, a, b, c, faceNormals, kept * 3)) continue
    indices[kept * 3] = a
    indices[kept * 3 + 1] = b
    indices[kept * 3 + 2] = c
    kept++
  }
  return {
    positions: positions.slice(0, verts.size * 3),
    indices: indices.slice(0, kept * 3),
    faceNormals: faceNormals.slice(0, kept * 3),
    triangles: kept,
    vertices: verts.size,
  }
}

/** Writes the unit normal of (a, b, c) to out[o..o+2]; false if the triangle has no area. */
function faceNormal(p: Float32Array, a: number, b: number, c: number, out: Float32Array, o: number): boolean {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2]
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (!(len > 0) || !Number.isFinite(len)) return false
  out[o] = nx / len
  out[o + 1] = ny / len
  out[o + 2] = nz / len
  return true
}

/** Unique edges with their faces and dihedral angle. Never throws on bad topology. */
export function buildEdges(mesh: IndexedMesh): EdgeTable {
  const { indices, faceNormals: fn, triangles } = mesh
  const max = triangles * 3
  const edges = tupleIndex(max)
  const a = new Uint32Array(max), b = new Uint32Array(max)
  const f0 = new Int32Array(max).fill(-1), f1 = new Int32Array(max).fill(-1)
  const extra = new Map<number, number[]>() // faces beyond two: non-manifold

  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const i = indices[t * 3 + k], j = indices[t * 3 + ((k + 1) % 3)]
      const lo = i < j ? i : j, hi = i < j ? j : i
      const e = edges.idOf(lo, hi, 0)
      if (f0[e] === -1) {
        a[e] = lo
        b[e] = hi
        f0[e] = t
      } else if (f1[e] === -1) f1[e] = t
      else {
        const list = extra.get(e)
        if (list) list.push(t)
        else extra.set(e, [t])
      }
    }
  }

  const count = edges.size
  const flip = new Uint8Array(count)
  const angle = new Float32Array(count)
  // Does face f walk the edge lo -> hi? Consistently wound neighbours walk it in opposite directions.
  const forward = (f: number, lo: number, hi: number) => {
    for (let k = 0; k < 3; k++) if (indices[f * 3 + k] === lo) return indices[f * 3 + ((k + 1) % 3)] === hi
    return false
  }
  const isFlipped = (e: number, g: number, h: number) => forward(g, a[e], b[e]) === forward(h, a[e], b[e])
  const degBetween = (g: number, h: number, flipped: boolean) => {
    const dot = (flipped ? -1 : 1) * (fn[g * 3] * fn[h * 3] + fn[g * 3 + 1] * fn[h * 3 + 1] + fn[g * 3 + 2] * fn[h * 3 + 2])
    return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI
  }

  for (let e = 0; e < count; e++) {
    if (f1[e] === -1) {
      angle[e] = 180
      continue
    }
    const flipped = isFlipped(e, f0[e], f1[e])
    flip[e] = flipped ? 1 : 0
    angle[e] = degBetween(f0[e], f1[e], flipped)
  }

  // Non-manifold: keep the face pair with the largest angle so the sharpest crease survives.
  for (const [e, more] of extra) {
    const faces = [f0[e], f1[e], ...more]
    for (let i = 0; i < faces.length; i++)
      for (let j = i + 1; j < faces.length; j++) {
        const flipped = isFlipped(e, faces[i], faces[j])
        const deg = degBetween(faces[i], faces[j], flipped)
        if (deg > angle[e]) {
          f0[e] = faces[i]
          f1[e] = faces[j]
          flip[e] = flipped ? 1 : 0
          angle[e] = deg
        }
      }
  }

  return {
    count,
    a: a.slice(0, count),
    b: b.slice(0, count),
    f0: f0.slice(0, count),
    f1: f1.slice(0, count),
    flip,
    angle,
    nonManifold: extra.size,
  }
}
