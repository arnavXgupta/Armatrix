import type { Vec3 } from '../geometry/types'
import { newId, polylineLength, type Seam } from '../store/seams'
import { defaultParams } from './defaults'
import { PROCESSES, UNIT_SCALE, WEAVE_PATTERNS, WELD_TYPES, type SourceUnits, type WeldJob, type WeldParams } from './schema'

const fail = (message: string): never => {
  throw new Error(message)
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const vec = (v: unknown): Vec3 | undefined =>
  Array.isArray(v) && v.length === 3 && v.every((x) => num(x) !== undefined) ? (v as Vec3) : undefined

/** Parse and shape-check an imported file. Throws an Error with a user-facing message. */
export function parseWeldJob(text: string): WeldJob {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    fail('This file is not valid JSON.')
  }
  if (!isObj(doc)) return fail('This file is not a weld job.')
  const version = typeof doc.schemaVersion === 'string' ? doc.schemaVersion : ''
  if (!version) fail('This file has no schemaVersion, so it is not a weld job from this app.')
  if (version.split('.')[0] !== '1') fail(`This file uses schema ${version}; this app reads 1.x.`)
  if (!isObj(doc.part) || typeof doc.part.sha256 !== 'string') fail('The file has no part section.')
  if (!Array.isArray(doc.seams)) fail('The file has no seams list.')
  ;(doc.seams as unknown[]).forEach((s, i) => {
    if (!isObj(s) || !Array.isArray(s.path) || s.path.length < 2) fail(`Seam ${i + 1} has fewer than 2 waypoints.`)
    ;((s as { path: unknown[] }).path).forEach((w, j) => {
      if (!isObj(w) || !vec(w.p) || !vec(w.n)) fail(`Seam ${i + 1}, waypoint ${j + 1} is not { p: [x,y,z], n: [x,y,z] }.`)
    })
  })
  return doc as WeldJob
}

/** Merge whatever the file has over the defaults for its weld type, keeping only valid values. */
function readParams(raw: unknown): WeldParams {
  const p = isObj(raw) ? raw : {}
  const weldType = WELD_TYPES.find((t) => t === p.weldType) ?? 'fillet'
  const process = PROCESSES.find((t) => t === p.process) ?? 'GMAW'
  const base = defaultParams(weldType, process)
  const w = isObj(p.weave) ? p.weave : {}
  const pattern = WEAVE_PATTERNS.find((t) => t === w.pattern) ?? 'none'
  return {
    weldType,
    process,
    travelSpeedMmS: num(p.travelSpeedMmS) ?? base.travelSpeedMmS,
    wireFeedMMin: num(p.wireFeedMMin) ?? base.wireFeedMMin,
    voltageV: num(p.voltageV) ?? base.voltageV,
    currentA: num(p.currentA) ?? base.currentA,
    passes: num(p.passes) ?? base.passes,
    weave: pattern === 'none' ? { pattern } : { pattern, amplitudeMm: num(w.amplitudeMm) ?? 2, frequencyHz: num(w.frequencyHz) ?? 1 },
    workAngleDeg: num(p.workAngleDeg) ?? base.workAngleDeg,
    travelAngleDeg: num(p.travelAngleDeg) ?? base.travelAngleDeg,
    approachMm: num(p.approachMm) ?? base.approachMm,
    retractMm: num(p.retractMm) ?? base.retractMm,
    tackFirst: typeof p.tackFirst === 'boolean' ? p.tackFirst : base.tackFirst,
  }
}

/** Export document → seams in the part's own units (the inverse of toWeldJob). */
export function seamsFromJob(job: WeldJob): Seam[] {
  const k = UNIT_SCALE[(job.part.sourceUnits as SourceUnits) in UNIT_SCALE ? job.part.sourceUnits : 'mm']
  const seen = new Set<string>()
  return job.seams.map((s, i) => {
    const id = typeof s.id === 'string' && s.id && !seen.has(s.id) ? s.id : newId()
    seen.add(id)
    const points = s.path.map((w) => w.p.map((v) => v / k) as Vec3)
    const normals = s.path.map((w) => {
      const len = Math.hypot(...w.n) || 1
      return w.n.map((v) => v / len) as Vec3
    })
    const closed = s.closed === true
    return {
      id,
      name: typeof s.name === 'string' && s.name.trim() ? s.name : `S-${String(i + 1).padStart(2, '0')}`,
      source: s.source === 'manual' ? 'manual' : 'auto',
      points,
      normals,
      closed,
      length: polylineLength(points, closed),
      params: readParams(s.parameters),
      ...(typeof s.notes === 'string' && s.notes ? { notes: s.notes } : {}),
    }
  })
}
