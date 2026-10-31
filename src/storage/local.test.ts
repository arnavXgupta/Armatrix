import { describe, expect, test } from 'vitest'
import { seamsFromJob } from '../export/fromWeldJob'
import { toWeldJob } from '../export/toWeldJob'
import { seamFromPoints } from '../store/seams'
import { readPlanDocument } from '../store/persist'
import { createLocalStore, PLAN_KEY } from './local'
import type { PlanDocument } from './types'

/** Minimal Storage stand-in; `quota` makes setItem throw like a full browser store. */
function memoryStorage(quota = false): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => {
      if (quota) throw new DOMException('full', 'QuotaExceededError')
      m.set(k, v)
    },
  }
}

const doc = (): PlanDocument => {
  const seams = [seamFromPoints([[0, 0, 0], [3, 4, 0]], [[0, 0, 1], [0, 0, 1]], false, 's1', 'S-01')]
  const part = { name: 'bracket.stl', sha256: 'abc', triangles: 12, bbox: { min: [0, 0, 0], max: [10, 10, 10] } as never, units: 'in' as const }
  return {
    savedAt: '2026-10-31T12:00:00.000Z',
    job: toWeldJob({ part, seams, job: { id: 'j', name: '', operator: '', notes: '' } }),
    ui: { angleThreshold: 42, units: 'in', selectedSeamId: 's1' },
  }
}

describe('local plan storage', () => {
  test('save, load, clear', async () => {
    const ls = memoryStorage()
    const store = createLocalStore(() => ls)
    const saved = doc()
    expect(await store.loadPlan()).toEqual({ ok: true, value: null })
    expect((await store.savePlan(saved)).ok).toBe(true)
    expect(ls.getItem(PLAN_KEY)).toContain('"angleThreshold":42')
    expect(await store.loadPlan()).toEqual({ ok: true, value: saved })
    await store.clearPlan()
    expect(ls.getItem(PLAN_KEY)).toBeNull()
  })

  test('a full store or a blocked one reports a reason instead of throwing', async () => {
    expect(await createLocalStore(() => memoryStorage(true)).savePlan(doc())).toEqual({ ok: false, reason: 'browser storage is full' })
    const blocked = createLocalStore(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(await blocked.loadPlan()).toEqual({ ok: false, reason: 'storage is blocked in this window' })
  })

  test('IndexedDB missing (tests, odd browsers): file calls fail softly', async () => {
    expect((await createLocalStore(() => memoryStorage()).saveFile('abc', 'a.stl', new Blob(['x']))).ok).toBe(false)
  })
})

describe('plan document', () => {
  test('round trip through JSON gives back the seams in part units', () => {
    const back = readPlanDocument(JSON.parse(JSON.stringify(doc())))!
    expect(back.ui).toEqual({ angleThreshold: 42, units: 'in', selectedSeamId: 's1' })
    const seams = seamsFromJob(back.job)
    seams[0].points[1].forEach((v, i) => expect(v).toBeCloseTo([3, 4, 0][i], 9))
    expect(seams[0].length).toBeCloseTo(5)
  })

  test('garbage is treated as no plan', () => {
    expect(readPlanDocument({ ui: { angleThreshold: 30 }, job: { schemaVersion: '9.0' } })).toBeNull()
    expect(readPlanDocument(null)).toBeNull()
  })
})
