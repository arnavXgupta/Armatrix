import { describe, expect, test } from 'vitest'
import type { Units } from '../geometry/parseStl'
import type { Vec3 } from '../geometry/types'
import { seamFromPoints, type Seam } from '../store/seams'
import { defaultParams } from './defaults'
import { parseWeldJob, seamsFromJob } from './fromWeldJob'
import { PROCESSES, WELD_TYPES, type WeldJob } from './schema'
import { GENERATOR, estimateTimeS, formatJob, toWeldJob } from './toWeldJob'
import { validateJob } from './validate'

const up: Vec3 = [0, 0, 1]
const seam = (id: string, name: string, pts: Vec3[], closed = false): Seam =>
  seamFromPoints(pts, pts.map(() => up), closed, id, name, defaultParams('fillet'))
const part = (units: Units = 'mm') => ({
  name: 'bracket.stl',
  sha256: 'abc123',
  triangles: 48,
  bbox: { min: [0, 0, 0] as Vec3, max: [200, 120, 90] as Vec3 },
  units,
})
const job = { id: 'job-1', name: '', operator: 'Ana', notes: '' }
const twoSeams = () => [seam('s1', 'S-01', [[0, 0, 10], [100, 0, 10]]), seam('s2', 'S-02', [[0, 0, 0], [0, 50, 0], [0, 50, 20]])]
const exportJob = (units: Units = 'mm', seams = twoSeams()) => toWeldJob({ part: part(units), seams, job, createdAt: '2026-10-31T12:00:00.000Z' })
const decimals = (v: number) => (String(v).split('.')[1] ?? '').length

describe('defaultParams', () => {
  test('every type × process gives positive arc settings, 1 pass, no weave', () => {
    for (const t of WELD_TYPES)
      for (const p of PROCESSES) {
        const d = defaultParams(t, p)
        expect(d.travelSpeedMmS).toBeGreaterThan(0)
        expect(d.voltageV).toBeGreaterThan(0)
        expect(d.currentA).toBeGreaterThan(0)
        expect(d.wireFeedMMin).toBeGreaterThanOrEqual(0)
        expect(d).toMatchObject({ weldType: t, process: p, passes: 1, weave: { pattern: 'none' } })
      }
  })
  test('matches the table and the process adjustments', () => {
    expect(defaultParams('fillet', 'GMAW')).toMatchObject({ travelSpeedMmS: 6, wireFeedMMin: 7.5, voltageV: 22, currentA: 180, workAngleDeg: 45 })
    expect(defaultParams('fillet', 'GTAW')).toMatchObject({ travelSpeedMmS: 4.2, wireFeedMMin: 0, voltageV: 12, currentA: 144 })
    expect(defaultParams('groove', 'FCAW')).toMatchObject({ wireFeedMMin: 8.5, voltageV: 25, currentA: 210 })
  })
})

describe('toWeldJob', () => {
  test('header, order, summary', () => {
    const j = exportJob()
    expect(j).toMatchObject({ schemaVersion: '1.0', jobId: 'job-1', name: 'bracket', generator: GENERATOR, operator: 'Ana', units: 'mm', coordinateFrame: 'part' })
    expect(j.notes).toBeUndefined()
    expect(j.seams.map((s) => s.order)).toEqual([1, 2])
    expect(j.summary.seamCount).toBe(2)
    expect(j.summary.totalLengthMm).toBeCloseTo(170)
    expect(j.summary.estimatedTimeS).toBe(Math.round(170 / 6 + 2 * 4))
  })

  test('inch part: coordinates and lengths ×25.4, normals stay unit, ≤ 3 decimals', () => {
    const j = exportJob('in')
    expect(j.part.sourceUnits).toBe('in')
    expect(j.seams[0].path[1].p).toEqual([2540, 0, 254])
    expect(j.seams[0].lengthMm).toBeCloseTo(2540)
    expect(j.part.boundingBox.max).toEqual([5080, 3048, 2286])
    for (const s of j.seams)
      for (const w of s.path) {
        expect(Math.hypot(...w.n)).toBeCloseTo(1, 5)
        for (const v of w.p) expect(decimals(v)).toBeLessThanOrEqual(3)
      }
  })

  test('formatJob puts number arrays on one line and parses back unchanged', () => {
    const j = exportJob('in')
    const text = formatJob(j)
    expect(text).toContain('"p": [2540, 0, 254]')
    expect(text).toMatch(/"name": "[^"]+",\n/) // everything else stays one field per line
    expect(JSON.parse(text)).toEqual(j)
  })

  test('estimateTimeS counts passes and the per-seam allowance', () => {
    expect(estimateTimeS([{ lengthMm: 60, params: { ...defaultParams(), passes: 3 } }])).toBe(60 / 6 * 3 + 4)
  })
})

describe('validateJob', () => {
  const ctx = { units: 'mm' as Units, nonManifold: 0 }
  test('a clean job has no issues', () => {
    expect(validateJob(exportJob(), ctx)).toEqual([])
  })

  test('every error rule fires', () => {
    const s = twoSeams()
    s[0].params = { ...s[0].params, passes: 0, travelSpeedMmS: 0, currentA: -1, voltageV: 0, weave: { pattern: 'zigzag' } }
    s[1].name = 'S-01'
    const short = seam('s3', 'S-03', [[0, 0, 0], [0.5, 0, 0]])
    const msgs = validateJob(exportJob('mm', [...s, short]), { units: 'unknown', nonManifold: 0 })
      .filter((i) => i.level === 'error')
      .map((i) => i.field ?? i.message)
    expect(msgs).toEqual(
      expect.arrayContaining(['passes', 'travelSpeedMmS', 'currentA', 'voltageV', 'amplitudeMm', 'frequencyHz', 'name']),
    )
    expect(msgs.some((m) => /units are unknown/.test(m))).toBe(true)
    expect(msgs.some((m) => /shorter than 1 mm/.test(m))).toBe(true)
    expect(validateJob(exportJob('mm', []), ctx).some((i) => /No seams/.test(i.message))).toBe(true)
  })

  test('every warning rule fires, and warnings alone do not block', () => {
    const s = twoSeams()
    s[0].params = { ...s[0].params, wireFeedMMin: 0, travelAngleDeg: -40, approachMm: 2, passes: 1000 }
    const issues = validateJob(exportJob('mm', s), { units: 'mm', nonManifold: 3 })
    expect(issues.every((i) => i.level === 'warning')).toBe(true)
    expect(issues.map((i) => i.field ?? i.message)).toEqual(
      expect.arrayContaining(['wireFeedMMin', 'travelAngleDeg', 'approachMm', expect.stringMatching(/over 2 hours/), expect.stringMatching(/non-manifold/)]),
    )
  })
})

describe('import', () => {
  test('round trip reproduces seams in part units, params and names', () => {
    const original = twoSeams()
    original[1].params = { ...defaultParams('butt', 'GTAW'), passes: 2, weave: { pattern: 'circular', amplitudeMm: 1.5, frequencyHz: 2 } }
    original[1].notes = 'root pass first'
    const back = seamsFromJob(parseWeldJob(JSON.stringify(exportJob('in', original))))
    expect(back.map((s) => s.name)).toEqual(['S-01', 'S-02'])
    expect(back[1].params).toEqual(original[1].params)
    expect(back[1].notes).toBe('root pass first')
    back.forEach((s, i) => {
      expect(s.length).toBeCloseTo(original[i].length, 5)
      s.points.forEach((p, j) => p.forEach((v, k) => expect(v).toBeCloseTo(original[i].points[j][k], 5)))
    })
  })

  test('refuses other major versions and broken files with a message; never throws raw', () => {
    const j = exportJob()
    expect(() => parseWeldJob(JSON.stringify({ ...j, schemaVersion: '2.0' }))).toThrow(/schema 2\.0/)
    expect(() => parseWeldJob('{ not json')).toThrow(/not valid JSON/)
    expect(() => parseWeldJob(JSON.stringify({ ...j, seams: [{ path: [{ p: [0, 0], n: [0, 0, 1] }, { p: [1, 1, 1], n: [0, 0, 1] }] }] }))).toThrow(/waypoint 1/)
  })

  test('missing or bad parameters fall back to defaults; duplicate ids are replaced', () => {
    const j = exportJob() as WeldJob
    const raw = JSON.parse(JSON.stringify(j))
    raw.seams[0].parameters = { weldType: 'lap', travelSpeedMmS: 'fast' }
    raw.seams[1].id = raw.seams[0].id
    const back = seamsFromJob(parseWeldJob(JSON.stringify(raw)))
    expect(back[0].params).toEqual(defaultParams('lap', 'GMAW'))
    expect(back[0].id).not.toBe(back[1].id)
  })
})
