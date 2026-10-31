// Test-only helpers: tiny synthetic meshes and STL writers. Not imported by the app.
import { parseStl } from './parseStl'
import type { RawMesh, Vec3 } from './types'

export type Tri = [Vec3, Vec3, Vec3]

/**
 * Closed prism: CCW polygon in XY extruded from z0 to z1, outward winding.
 * `cap` triangulates the polygon by vertex index. `skipTop` leaves the top open.
 */
export function prism(poly: [number, number][], cap: [number, number, number][], z0: number, z1: number, skipTop = false): Tri[] {
  const at = (i: number, z: number): Vec3 => [poly[i][0], poly[i][1], z]
  const tris: Tri[] = []
  for (const [i, j, k] of cap) {
    if (!skipTop) tris.push([at(i, z1), at(j, z1), at(k, z1)])
    tris.push([at(i, z0), at(k, z0), at(j, z0)])
  }
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    tris.push([at(i, z0), at(j, z0), at(j, z1)], [at(i, z0), at(j, z1), at(i, z1)])
  }
  return tris
}

export const box = (min: Vec3, max: Vec3, skipTop = false) =>
  prism(
    [
      [min[0], min[1]],
      [max[0], min[1]],
      [max[0], max[1]],
      [min[0], max[1]],
    ],
    [
      [0, 1, 2],
      [0, 2, 3],
    ],
    min[2],
    max[2],
    skipTop,
  )

export const cube = () => box([0, 0, 0], [1, 1, 1])

/** L-shaped prism, concave edge along Z at (1, 1). */
export const lBracket = () =>
  prism(
    [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
    ],
    [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
      [0, 4, 5],
    ],
    0,
    1,
  )

export function toBinary(tris: Tri[], header = 'binary test part'): ArrayBuffer {
  const buf = new ArrayBuffer(84 + tris.length * 50)
  const view = new DataView(buf)
  for (let i = 0; i < Math.min(80, header.length); i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, tris.length, true)
  tris.forEach((tri, t) => {
    const base = 84 + t * 50 + 12
    tri.flat().forEach((v, k) => view.setFloat32(base + k * 4, v, true))
  })
  return buf
}

export function toAscii(tris: Tri[], opts: { crlf?: boolean; sci?: boolean; endsolid?: boolean; tail?: string } = {}): ArrayBuffer {
  const nl = opts.crlf ? '\r\n' : '\n'
  const num = (v: number) => (opts.sci ? v.toExponential() : String(v))
  const lines = ['solid test']
  for (const tri of tris) {
    lines.push('  facet normal 0 0 0', '    outer loop')
    for (const p of tri) lines.push(`      vertex ${p.map(num).join('   ')}`)
    lines.push('    endloop', '  endfacet')
  }
  if (opts.endsolid !== false) lines.push('endsolid test')
  return new TextEncoder().encode(lines.join(nl) + nl + (opts.tail ?? '')).buffer as ArrayBuffer
}

export const raw = (tris: Tri[]): RawMesh => parseStl(toBinary(tris))
