import type { Candidate, EdgeTable, IndexedMesh, Vec3 } from './types'

/**
 * Candidate seams: edges sharper than thresholdDeg plus every boundary edge, chained into
 * polylines that break at ends and junctions. Chains shorter than minLength are dropped.
 * Sorted longest first; ids follow that order.
 */
export function findCandidates(
  mesh: IndexedMesh,
  edges: EdgeTable,
  thresholdDeg: number,
  minLength: number,
  inContact: (face: number) => boolean = () => false, // see contact.ts
): Candidate[] {
  const { a, b, f0, f1, flip, angle } = edges
  const sel = new Int32Array(edges.count)
  let ns = 0
  for (let e = 0; e < edges.count; e++) if (f1[e] === -1 || angle[e] >= thresholdDeg) sel[ns++] = e

  // vertex -> selected edges, compressed rows
  const V = mesh.vertices
  const deg = new Uint32Array(V)
  for (let i = 0; i < ns; i++) {
    deg[a[sel[i]]]++
    deg[b[sel[i]]]++
  }
  const start = new Uint32Array(V + 1)
  for (let v = 0; v < V; v++) start[v + 1] = start[v] + deg[v]
  const cursor = start.slice(0, V)
  const adj = new Int32Array(ns * 2)
  for (let i = 0; i < ns; i++) {
    adj[cursor[a[sel[i]]]++] = i
    adj[cursor[b[sel[i]]]++] = i
  }

  const used = new Uint8Array(ns)
  const other = (i: number, v: number) => (a[sel[i]] === v ? b[sel[i]] : a[sel[i]])
  const chains: { verts: number[]; es: number[] }[] = []
  const walk = (v0: number, i0: number) => {
    const verts = [v0]
    const es: number[] = []
    let v = v0
    let i = i0
    while (i >= 0) {
      used[i] = 1
      es.push(i)
      v = other(i, v)
      verts.push(v)
      if (deg[v] !== 2) break // end or junction: the chain stops here
      const x = adj[start[v]], y = adj[start[v] + 1]
      i = !used[x] ? x : !used[y] ? y : -1
    }
    chains.push({ verts, es })
  }

  // Open chains first, starting from ends and junctions, so they split there.
  for (let i = 0; i < ns; i++) {
    for (const v of [a[sel[i]], b[sel[i]]]) {
      if (deg[v] === 2) continue
      for (let k = start[v]; k < start[v + 1]; k++) if (!used[adj[k]]) walk(v, adj[k])
    }
  }
  // Whatever is left is a pure loop (every vertex has degree 2).
  for (let i = 0; i < ns; i++) if (!used[i]) walk(a[sel[i]], i)

  const P = mesh.positions
  const fn = mesh.faceNormals
  const point = (v: number): Vec3 => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]
  const edgeNormal = (e: number): Vec3 => {
    const g = f0[e] * 3
    const c0 = inContact(f0[e]), c1 = inContact(f1[e])
    // A face pressed against another body: the torch comes in along that body's surface normal instead.
    const s0 = c0 && !c1 ? -1 : 1
    const n: Vec3 = [s0 * fn[g], s0 * fn[g + 1], s0 * fn[g + 2]]
    if (f1[e] >= 0) {
      const h = f1[e] * 3
      const s = (flip[e] ? -1 : 1) * (c1 && !c0 ? -1 : 1)
      n[0] += s * fn[h]
      n[1] += s * fn[h + 1]
      n[2] += s * fn[h + 2]
    }
    return unit(n) ?? [fn[g], fn[g + 1], fn[g + 2]] // opposite faces (thin fin) cancel out
  }

  const out: Candidate[] = []
  for (const { verts, es } of chains) {
    const closed = verts.length > 3 && verts[0] === verts[verts.length - 1]
    if (closed) verts.pop()
    const points = verts.map(point)
    let length = 0
    for (let k = 1; k < points.length; k++) length += dist(points[k - 1], points[k])
    if (closed) length += dist(points[points.length - 1], points[0])
    if (length < minLength) continue

    const en = es.map((i) => edgeNormal(sel[i]))
    const m = es.length
    const normals = points.map((_, k) => {
      const before = closed ? en[(k - 1 + m) % m] : en[k - 1]
      const after = closed ? en[k % m] : en[k]
      if (!before || !after) return before ?? after
      return unit([before[0] + after[0], before[1] + after[1], before[2] + after[2]]) ?? after
    })

    let angleSum = 0
    let boundary = true
    for (const i of es) {
      angleSum += angle[sel[i]]
      if (f1[sel[i]] !== -1) boundary = false
    }
    out.push({ id: 0, points, normals, length, closed, kind: boundary ? 'boundary' : 'crease', meanAngleDeg: angleSum / m })
  }

  out.sort((p, q) => q.length - p.length)
  out.forEach((c, i) => (c.id = i))
  return out
}

const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

function unit(v: Vec3): Vec3 | null {
  const len = Math.hypot(v[0], v[1], v[2])
  return len > 1e-9 ? [v[0] / len, v[1] / len, v[2] / len] : null
}
