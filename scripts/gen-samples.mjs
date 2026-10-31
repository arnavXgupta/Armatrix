// Writes the synthetic test parts used in the README and the browser checks.
//   node scripts/gen-samples.mjs samples [path/to/40mmFan.stl]
// t-joint.stl and tube-on-plate-big.stl are byte-identical on every run (same sha256 as in the README
// example). With a binary STL as the second argument it also writes an ASCII copy of it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [outDir = 'samples', fanPath] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })

function writeBinary(path, tris, header) {
  const buf = Buffer.alloc(84 + tris.length * 50)
  buf.write(header.padEnd(80, ' ').slice(0, 80), 0, 'latin1')
  buf.writeUInt32LE(tris.length, 80)
  let o = 84
  for (const t of tris) {
    o += 12
    for (const p of t) for (const v of p) { buf.writeFloatLE(v, o); o += 4 }
    o += 2
  }
  writeFileSync(path, buf)
  console.log(path, tris.length, 'tris', (buf.length / 1e6).toFixed(1), 'MB')
}

function readBinary(path) {
  const b = readFileSync(path)
  const n = b.readUInt32LE(80)
  const tris = []
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12
    const tri = []
    for (let k = 0; k < 3; k++) tri.push([b.readFloatLE(o + k * 12), b.readFloatLE(o + k * 12 + 4), b.readFloatLE(o + k * 12 + 8)])
    tris.push(tri)
  }
  return tris
}

function writeAscii(path, tris) {
  const lines = ['solid ascii_part']
  for (const t of tris) {
    lines.push('  facet normal 0.000000e+00 0.000000e+00 0.000000e+00', '    outer loop')
    for (const p of t) lines.push('      vertex ' + p.map((v) => v.toExponential(6)).join(' '))
    lines.push('    endloop', '  endfacet')
  }
  lines.push('endsolid ascii_part')
  writeFileSync(path, lines.join('\r\n') + '\r\n')
  console.log(path, tris.length, 'tris (ascii)')
}

// CCW polygon extruded along Z, outward winding (same as src/geometry/fixtures.ts)
function prism(poly, cap, z0, z1) {
  const at = (i, z) => [poly[i][0], poly[i][1], z]
  const tris = []
  for (const [i, j, k] of cap) tris.push([at(i, z1), at(j, z1), at(k, z1)], [at(i, z0), at(k, z0), at(j, z0)])
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    tris.push([at(i, z0), at(j, z0), at(j, z1)], [at(i, z0), at(j, z1), at(i, z1)])
  }
  return tris
}
const box = (x0, y0, z0, x1, y1, z1) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [[0, 1, 2], [0, 2, 3]], z0, z1)

// Prism extruded along Y instead of Z (for gussets): polygon given in XZ, CCW seen from -Y
function prismY(polyXZ, cap, y0, y1) {
  // build along Z with (x, z) -> (x, y) then swap y/z; swapping two axes flips handedness, so reverse winding
  return prism(polyXZ, cap, y0, y1).map((t) => [t[0], t[2], t[1]].map(([x, y, z]) => [x, z, y]))
}

// 1. ASCII copy of the fan (CRLF, scientific notation)
if (fanPath) writeAscii(join(outDir, '40mmFan-ascii.stl'), readBinary(fanPath))

// 2. T-joint weldment: base plate, web plate, two gussets. Separate closed bodies, like a CAD assembly export.
const tj = [
  ...box(0, 0, 0, 200, 120, 10), // base plate
  ...box(95, 0, 10, 105, 120, 90), // web
  ...prismY([[105, 10], [145, 10], [105, 50]], [[0, 1, 2]], 15, 23), // gusset right, front
  ...prismY([[105, 10], [145, 10], [105, 50]], [[0, 1, 2]], 97, 105), // gusset right, back
  ...prismY([[55, 10], [95, 10], [95, 50]], [[0, 1, 2]], 56, 64), // gusset left, middle
]
writeBinary(join(outDir, 't-joint.stl'), tj, 'solid t-joint weldment mm')

// 3. Big: thick tube standing on a plate, finely tessellated (~1M triangles, >50 MB)
function tube(cx, cy, r0, r1, z0, z1, seg, rings) {
  const tris = []
  const P = (r, i, z) => [cx + r * Math.cos((i / seg) * 2 * Math.PI), cy + r * Math.sin((i / seg) * 2 * Math.PI), z]
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg
    for (let k = 0; k < rings; k++) {
      const za = z0 + ((z1 - z0) * k) / rings, zb = z0 + ((z1 - z0) * (k + 1)) / rings
      tris.push([P(r1, i, za), P(r1, j, za), P(r1, j, zb)], [P(r1, i, za), P(r1, j, zb), P(r1, i, zb)]) // outer wall, out
      tris.push([P(r0, i, za), P(r0, j, zb), P(r0, j, za)], [P(r0, i, za), P(r0, i, zb), P(r0, j, zb)]) // inner wall, in
    }
    tris.push([P(r0, i, z1), P(r1, i, z1), P(r1, j, z1)], [P(r0, i, z1), P(r1, j, z1), P(r0, j, z1)]) // top annulus
    tris.push([P(r0, i, z0), P(r1, j, z0), P(r1, i, z0)], [P(r0, i, z0), P(r0, j, z0), P(r1, j, z0)]) // bottom annulus
  }
  return tris
}
writeBinary(join(outDir, 'tube-on-plate-big.stl'), [...box(0, 0, 0, 300, 300, 12), ...tube(150, 150, 34, 40, 12, 162, 1024, 256)], 'solid big tube on plate mm')
