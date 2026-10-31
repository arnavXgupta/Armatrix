import type { Bbox, RawMesh } from './types'

type Progress = (fraction: number) => void

/** Parse a binary or ASCII STL. Throws an Error with a user-facing message on bad input. */
export function parseStl(buffer: ArrayBuffer, onProgress?: Progress): RawMesh {
  const bytes = new Uint8Array(buffer)
  if (bytes.length === 0) throw new Error('The file is empty.')

  const declared = bytes.length >= 84 ? new DataView(buffer).getUint32(80, true) : -1
  // Size rule first: many binary files also start with "solid" in their header.
  if (declared >= 0 && 84 + 50 * declared === bytes.length) return parseBinary(buffer, declared, onProgress)

  if (startsWithSolid(bytes)) {
    const mesh = parseAscii(bytes, onProgress)
    if (mesh) return mesh
  }

  if (declared > 0) {
    const room = Math.floor((bytes.length - 84) / 50)
    if (declared > room) {
      throw new Error(
        `This is not a readable STL. The header lists ${declared.toLocaleString()} triangles but the file only has room for ${room.toLocaleString()}; it may be truncated.`,
      )
    }
    return parseBinary(buffer, declared, onProgress) // some exporters pad the end; ignore the extra bytes
  }
  throw new Error('This is not a readable STL. It has no "solid" header and no binary triangles.')
}

function startsWithSolid(bytes: Uint8Array): boolean {
  let i = 0
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3 // UTF-8 BOM
  while (i < bytes.length && (bytes[i] === 32 || bytes[i] === 9 || bytes[i] === 10 || bytes[i] === 13)) i++
  const word = String.fromCharCode(...bytes.subarray(i, i + 5))
  return word.toLowerCase() === 'solid'
}

function parseBinary(buffer: ArrayBuffer, n: number, onProgress?: Progress): RawMesh {
  const view = new DataView(buffer)
  const out = new Float32Array(n * 9)
  for (let t = 0; t < n; t++) {
    const base = 84 + t * 50 + 12 // skip the stored normal: often wrong, we recompute it
    for (let k = 0; k < 9; k++) out[t * 9 + k] = view.getFloat32(base + k * 4, true)
    if (onProgress && t % 50_000 === 0) onProgress(t / n)
  }
  return compact(out, n, 'binary')
}

/** Returns null when the text holds no vertices, so the caller can try binary instead. */
function parseAscii(bytes: Uint8Array, onProgress?: Progress): RawMesh | null {
  const text = new TextDecoder().decode(bytes)
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi
  let out = new Float32Array(1 << 16)
  let len = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (len + 3 > out.length) {
      const grown = new Float32Array(out.length * 2)
      grown.set(out)
      out = grown
    }
    out[len++] = Number(m[1])
    out[len++] = Number(m[2])
    out[len++] = Number(m[3])
    if (onProgress && len % 150_000 === 0) onProgress(re.lastIndex / text.length)
  }
  // ponytail: assumes 3 vertices per facet (the STL spec); polygon facets from odd exporters would misalign.
  const n = Math.floor(len / 9)
  if (n === 0) return null
  return compact(out, n, 'ascii')
}

/** Drop degenerate triangles in place and compute the bbox of what is left. */
function compact(p: Float32Array, n: number, format: RawMesh['format']): RawMesh {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  let kept = 0
  for (let t = 0; t < n; t++) {
    const o = t * 9
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2]
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2]
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
    const area2 = cx * cx + cy * cy + cz * cz
    if (!(area2 > 1e-24) || !Number.isFinite(area2)) continue // zero area, NaN or Infinity
    const d = kept * 9
    for (let k = 0; k < 9; k++) {
      const v = p[o + k]
      p[d + k] = v
      const axis = k % 3
      if (v < min[axis]) min[axis] = v
      if (v > max[axis]) max[axis] = v
    }
    kept++
  }
  if (kept === 0) throw new Error('The file has no usable triangles.')
  const positions = p.length === kept * 9 ? p : p.slice(0, kept * 9) // exact size: the buffer is transferred whole
  return { positions, triangles: kept, dropped: n - kept, format, bbox: { min, max } }
}

export type Units = 'mm' | 'in' | 'm' | 'unknown'

/** STL has no units. Guess from the longest extent; the user confirms in the toolbar. */
export function guessUnits(bbox: Bbox): Units {
  const longest = Math.max(...bbox.max.map((v, i) => v - bbox.min[i]))
  if (longest >= 10 && longest <= 10_000) return 'mm'
  if (longest >= 0.4 && longest < 10) return 'in'
  return 'unknown'
}

export const bboxSize = (b: Bbox): [number, number, number] => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
export const bboxDiagonal = (b: Bbox) => Math.hypot(...bboxSize(b))
