import { version } from '../../package.json'
import { bboxDiagonal, type Units } from '../geometry/parseStl'
import type { Bbox, Vec3 } from '../geometry/types'
import type { Seam } from '../store/seams'
import { airTravel } from '../store/sequence'
import { AIR_SPEED_MM_S, SEAM_OVERHEAD_S } from './defaults'
import { SCHEMA_VERSION, UNIT_SCALE, type ExportedSeam, type SourceUnits, type WeldJob, type WeldParams } from './schema'

export const GENERATOR = `armatrix-weld-seam-planner/${version}`

/** Pretty JSON with number arrays (points, normals) on one line: `"p": [105, 0, 10]`. */
export const formatJob = (job: unknown) =>
  JSON.stringify(job, null, 2).replace(/\[\s+([-+\d.e,\s]+?)\s+\]/g, (_, inner: string) => `[${inner.split(/,\s*/).join(', ')}]`)

export type JobMeta = { id: string; name: string; operator: string; notes: string }
export type JobInput = {
  part: { name: string; sha256: string; triangles: number; bbox: Bbox; units: Units }
  seams: Seam[]
  job: JobMeta
  createdAt?: string
}

/** Unknown units export at scale 1 (validation blocks the download until the user picks). */
export const sourceUnits = (u: Units): SourceUnits => (u === 'unknown' ? 'mm' : u)
export const mmPerUnit = (u: Units) => UNIT_SCALE[sourceUnits(u)]

/** Arc time, air moves and a fixed start/stop allowance per seam. Seams with no valid speed add only the allowance. */
export function estimateTimeS(seams: { lengthMm: number; params: WeldParams }[], airTravelMm = 0): number {
  let t = airTravelMm / AIR_SPEED_MM_S
  for (const { lengthMm, params } of seams) {
    if (params.travelSpeedMmS > 0) t += (lengthMm / params.travelSpeedMmS) * Math.max(1, params.passes)
    t += SEAM_OVERHEAD_S
  }
  return t
}

/** Store state → export document. Pure; everything in mm. */
export function toWeldJob({ part, seams, job, createdAt = new Date().toISOString() }: JobInput): WeldJob {
  const k = mmPerUnit(part.units)
  // 3 decimals (1 µm) for ordinary parts; more for tiny ones so nothing collapses.
  const dp = Math.min(9, Math.max(3, 5 - Math.floor(Math.log10(bboxDiagonal(part.bbox) * k || 1))))
  const r = (v: number) => Number(v.toFixed(dp))
  const mm = (p: Vec3): Vec3 => [r(p[0] * k), r(p[1] * k), r(p[2] * k)]
  const unit = (n: Vec3): Vec3 => [Number(n[0].toFixed(6)), Number(n[1].toFixed(6)), Number(n[2].toFixed(6))]

  const out: ExportedSeam[] = seams.map((s, i) => ({
    id: s.id,
    order: i + 1,
    name: s.name,
    source: s.source,
    closed: s.closed,
    lengthMm: r(s.length * k),
    parameters: { ...s.params, weave: { ...s.params.weave } },
    path: s.points.map((p, j) => ({ p: mm(p), n: unit(s.normals[j]) })),
    ...(s.notes ? { notes: s.notes } : {}),
  }))
  const totalLengthMm = out.reduce((sum, s) => sum + s.lengthMm, 0)
  const airTravelMm = r(airTravel(seams) * k)

  return {
    schemaVersion: SCHEMA_VERSION,
    jobId: job.id,
    name: job.name.trim() || part.name.replace(/\.stl$/i, ''),
    createdAt,
    generator: GENERATOR,
    ...(job.operator.trim() ? { operator: job.operator.trim() } : {}),
    ...(job.notes.trim() ? { notes: job.notes.trim() } : {}),
    units: 'mm',
    coordinateFrame: 'part',
    part: {
      fileName: part.name,
      sha256: part.sha256,
      triangles: part.triangles,
      boundingBox: { min: mm(part.bbox.min), max: mm(part.bbox.max) },
      sourceUnits: sourceUnits(part.units),
    },
    seams: out,
    summary: {
      seamCount: out.length,
      totalLengthMm: r(totalLengthMm),
      airTravelMm,
      estimatedTimeS: Math.round(estimateTimeS(out.map((s) => ({ lengthMm: s.lengthMm, params: s.parameters })), airTravelMm)),
    },
  }
}
