export type Vec3 = [number, number, number]
export type Bbox = { min: Vec3; max: Vec3 }

/** Triangle soup straight from the file, degenerate triangles removed. */
export type RawMesh = {
  positions: Float32Array // 9 floats per triangle, unmerged, raw file coordinates
  triangles: number
  dropped: number // degenerate triangles removed (zero area, NaN, Infinity)
  format: 'binary' | 'ascii'
  bbox: Bbox
}

/** Shared-vertex mesh rebuilt from the soup. */
export type IndexedMesh = {
  positions: Float32Array // 3 per unique vertex
  indices: Uint32Array // 3 per triangle
  faceNormals: Float32Array // 3 per triangle, unit length
  triangles: number
  vertices: number
}

/** One row per unique mesh edge. Struct-of-arrays so 500k-triangle parts stay cheap. */
export type EdgeTable = {
  count: number
  a: Uint32Array // vertex ids, a < b
  b: Uint32Array
  f0: Int32Array // adjacent faces; f1 = -1 on a boundary edge
  f1: Int32Array
  flip: Uint8Array // 1 when f0 and f1 are wound inconsistently, so f1's normal is negated
  angle: Float32Array // degrees between the two face normals; 180 on boundary edges
  nonManifold: number // edges with more than two faces (worst pair kept)
}

export type Candidate = {
  id: number
  points: Vec3[] // ordered polyline in raw part coordinates; closed loops do not repeat the first point
  normals: Vec3[] // per point, unit: mean of the adjacent face normals (torch approach direction)
  length: number
  closed: boolean
  kind: 'crease' | 'boundary'
  meanAngleDeg: number
}
