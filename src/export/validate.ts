import type { Units } from '../geometry/parseStl'
import type { WeldJob, WeldParams } from './schema'
import { toWeldJob, type JobInput } from './toWeldJob'

export type Issue = {
  level: 'error' | 'warning'
  message: string
  seamId?: string
  field?: keyof WeldParams | 'name' | 'amplitudeMm' | 'frequencyHz'
}

const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

/** Errors block the download; warnings are shown and allowed. */
export function validateJob(job: WeldJob, ctx: { units: Units; nonManifold: number }): Issue[] {
  const issues: Issue[] = []
  const err = (message: string, seamId?: string, field?: Issue['field']) => issues.push({ level: 'error', message, seamId, field })
  const warn = (message: string, seamId?: string, field?: Issue['field']) => issues.push({ level: 'warning', message, seamId, field })

  if (ctx.units === 'unknown') err('Part units are unknown. Pick mm, in or m in the toolbar so coordinates convert correctly.')
  if (job.seams.length === 0) err('No seams yet. Click a candidate edge or draw a manual seam.')

  const names = new Map<string, number>()
  for (const s of job.seams) {
    const key = s.name.trim().toLowerCase()
    names.set(key, (names.get(key) ?? 0) + 1)
  }

  for (const s of job.seams) {
    const at = `${s.name || `Seam ${s.order}`}:`
    const p = s.parameters
    if (!s.name.trim()) err(`Seam ${s.order} has no name.`, s.id, 'name')
    else if ((names.get(s.name.trim().toLowerCase()) ?? 0) > 1) err(`${at} the name is used by another seam.`, s.id, 'name')
    if (s.path.length < 2 || !(s.lengthMm >= 1)) err(`${at} the path is shorter than 1 mm.`, s.id)
    if (!finite(p.passes) || p.passes < 1 || !Number.isInteger(p.passes)) err(`${at} passes must be a whole number of at least 1.`, s.id, 'passes')
    if (!finite(p.travelSpeedMmS) || p.travelSpeedMmS <= 0) err(`${at} travel speed must be above 0.`, s.id, 'travelSpeedMmS')
    if (!finite(p.currentA) || p.currentA <= 0) err(`${at} current must be above 0.`, s.id, 'currentA')
    if (!finite(p.voltageV) || p.voltageV <= 0) err(`${at} voltage must be above 0.`, s.id, 'voltageV')
    if (!finite(p.wireFeedMMin) || p.wireFeedMMin < 0) err(`${at} wire feed cannot be negative.`, s.id, 'wireFeedMMin')
    for (const f of ['workAngleDeg', 'travelAngleDeg', 'approachMm', 'retractMm'] as const)
      if (!finite(p[f])) err(`${at} ${f} is not a number.`, s.id, f)
    if (p.weave.pattern !== 'none') {
      if (!(finite(p.weave.amplitudeMm) && p.weave.amplitudeMm! > 0)) err(`${at} weave amplitude must be above 0.`, s.id, 'amplitudeMm')
      if (!(finite(p.weave.frequencyHz) && p.weave.frequencyHz! > 0)) err(`${at} weave frequency must be above 0.`, s.id, 'frequencyHz')
    }

    if (p.wireFeedMMin === 0 && p.process !== 'GTAW') warn(`${at} wire feed is 0 for ${p.process}.`, s.id, 'wireFeedMMin')
    if (Math.abs(p.travelAngleDeg) > 30) warn(`${at} travel angle beyond ±30° is unusual.`, s.id, 'travelAngleDeg')
    if (p.approachMm < 5) warn(`${at} approach under 5 mm leaves little room to stabilise.`, s.id, 'approachMm')
  }

  if (job.summary.estimatedTimeS > 2 * 3600) warn('Estimated time is over 2 hours. Check travel speeds and passes.')
  if (ctx.nonManifold > 0) warn(`The mesh has ${ctx.nonManifold} non-manifold edges; check seams near them.`)
  return issues
}

/** The plan as it stands, checked as the export dialog checks it: counts and messages, errors first (Export badge). */
export function planIssues(input: JobInput & { part: { nonManifold: number } }) {
  const issues = validateJob(toWeldJob(input), { units: input.part.units, nonManifold: input.part.nonManifold })
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  return { errors: errors.length, warnings: warnings.length, messages: [...errors, ...warnings].map((i) => i.message) }
}
