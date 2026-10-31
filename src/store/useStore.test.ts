import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Candidate, RawMesh, Vec3 } from '../geometry/types'

// Worker client mock: every call returns a promise the test settles by hand, in any order.
const h = vi.hoisted(() => {
  type Deferred = { resolve: (v: unknown) => void; reject: (e: Error) => void }
  const defer = (list: Deferred[]) =>
    new Promise((resolve, reject) => {
      list.push({ resolve: resolve as Deferred['resolve'], reject })
    })
  return { loads: [] as Deferred[], cands: [] as Deferred[], epoch: 0, defer }
})
vi.mock('../workers/geometryClient', () => ({
  CancelledError: class CancelledError extends Error {},
  workerEpoch: () => h.epoch,
  loadInWorker: () => h.defer(h.loads),
  candidatesInWorker: () => h.defer(h.cands),
}))
vi.mock('../storage', () => {
  const ok = async () => ({ ok: true, value: null })
  return { storage: { savePlan: ok, loadPlan: ok, clearPlan: ok, saveFile: ok, loadFile: ok, clearFiles: ok } }
})

const { useStore } = await import('./useStore')
const { toWeldJob } = await import('../export/toWeldJob')

const stl = (name: string) => new File([new Uint8Array(84 + 50)], name)
const mesh = (): RawMesh => ({
  positions: new Float32Array(9),
  triangles: 1,
  dropped: 0,
  format: 'binary',
  bbox: { min: [0, 0, 0], max: [100, 50, 20] },
})
const loaded = () => ({ mesh: mesh(), vertices: 3, nonManifold: 0 })
const up: Vec3 = [0, 0, 1]
/** n collinear unit candidates along x: [0,1], [1,2], … so neighbours touch end to start. */
const cands = (n: number) => ({
  candidates: Array.from(
    { length: n },
    (_, id): Candidate => ({ id, points: [[id * 10, 0, 0], [id * 10 + 10, 0, 0]], normals: [up, up], length: 10, closed: false, kind: 'crease', meanAngleDeg: 90 }),
  ),
  ms: 1,
})
const flush = () => new Promise((r) => setTimeout(r, 0))
/** Wait until the store has called the worker n times for loads. */
const loadsSent = async (n: number) => {
  for (let i = 0; i < 50 && h.loads.length < n; i++) await flush()
  expect(h.loads).toHaveLength(n)
}
const st = () => useStore.getState()
/** Load a part and answer with `n` candidates. */
async function ready(name = 'a.stl', n = 4) {
  const done = st().loadFile(stl(name), { force: true })
  await loadsSent(h.loads.length + 1)
  h.loads[h.loads.length - 1].resolve(loaded())
  for (let i = 0; i < 50 && h.cands.length === 0; i++) await flush()
  h.cands[h.cands.length - 1].resolve(cands(n))
  await done
}

beforeEach(() => {
  h.loads.length = 0
  h.cands.length = 0
  h.epoch = 0
  st().clearPart(true)
})

describe('loading', () => {
  test('rejects a non-STL name without touching the worker', async () => {
    await st().loadFile(stl('part.obj'))
    expect(st().status).toMatchObject({ kind: 'error', message: expect.stringMatching(/not an \.stl/) })
    expect(h.loads).toHaveLength(0)
  })

  test('happy path: part, units guess, then candidates with their angle', async () => {
    const done = st().loadFile(stl('a.stl'))
    await loadsSent(1)
    h.loads[0].resolve(loaded())
    await flush()
    expect(st().part).toMatchObject({ name: 'a.stl', units: 'mm', unitsGuessed: true })
    expect(st().candidatesDeg).toBeNull()
    h.cands[0].resolve(cands(3))
    await done
    expect(st()).toMatchObject({ candidatesDeg: 30, status: { kind: 'ready' } })
    expect(st().candidates).toHaveLength(3)
  })

  test('a newer file wins even if the older one finishes last', async () => {
    void st().loadFile(stl('old.stl'))
    await loadsSent(1)
    void st().loadFile(stl('new.stl'))
    await loadsSent(2)
    h.loads[1].resolve(loaded())
    await flush()
    h.loads[0].resolve(loaded())
    await flush()
    expect(st().part?.name).toBe('new.stl')
  })

  test('only the newest candidates request is applied', async () => {
    await ready('a.stl', 1)
    vi.useFakeTimers()
    st().setThreshold(10)
    vi.advanceTimersByTime(100)
    st().setThreshold(60)
    vi.advanceTimersByTime(100)
    vi.useRealTimers()
    expect(h.cands).toHaveLength(3)
    h.cands[2].resolve(cands(5)) // 60°
    await flush()
    h.cands[1].resolve(cands(9)) // 10°, stale
    await flush()
    expect(st()).toMatchObject({ candidatesDeg: 60 })
    expect(st().candidates).toHaveLength(5)
  })

  test('a failed load keeps the previous part, unless the worker lost it', async () => {
    await ready('good.stl')
    void st().loadFile(stl('bad.stl'))
    await loadsSent(2)
    h.loads[1].reject(new Error('This is not a readable STL.'))
    await flush()
    expect(st().part?.name).toBe('good.stl')
    expect(st().status).toMatchObject({ kind: 'error', message: expect.stringMatching(/bad\.stl/) })

    void st().loadFile(stl('crash.stl'))
    await loadsSent(3)
    h.epoch++ // worker replaced: it no longer holds good.stl's edges
    h.loads[2].reject(new Error('The geometry worker stopped unexpectedly.'))
    await flush()
    expect(st().part).toBeNull()
  })
})

describe('seams', () => {
  test('clicking a candidate adds one seam; clicking it again toggles the selection, never a duplicate', async () => {
    await ready()
    st().addSeamFromCandidate(1)
    const id = st().selectedSeamId
    expect(st().seams).toHaveLength(1)
    expect(st().seams[0]).toMatchObject({ name: 'S-01', source: 'auto', length: 10 })
    st().addSeamFromCandidate(1)
    expect(st().seams).toHaveLength(1)
    expect(st().selectedSeamId).toBeNull()
    st().addSeamFromCandidate(1)
    expect(st().selectedSeamId).toBe(id)
  })

  test('shift-click joins a touching candidate; a far one is refused with a notice', async () => {
    await ready('a.stl', 4)
    st().addSeamFromCandidate(1) // x 10..20
    st().joinCandidate(2) // x 20..30
    st().joinCandidate(0) // x 0..10, joins at the start
    expect(st().seams).toHaveLength(1)
    expect(st().seams[0].length).toBeCloseTo(30)
    expect(st().seams[0].points[0]).toEqual([0, 0, 0])
    st().selectSeam(null)
    st().addSeamFromCandidate(3) // a second seam, x 30..40
    st().joinCandidate(1) // already in S-01
    expect(st().notice).toMatch(/already belongs to S-01/)
  })

  test('names are never reused; remove clears selection; move reorders', async () => {
    await ready('a.stl', 4)
    for (const i of [0, 1, 2]) {
      st().selectSeam(null)
      st().addSeamFromCandidate(i)
    }
    const [a, b, c] = st().seams
    st().removeSeam(c.id)
    expect(st().selectedSeamId).toBeNull()
    st().removeSeam(b.id)
    st().addSeamFromCandidate(3)
    expect(st().seams.map((s) => s.name)).toEqual(['S-01', 'S-04'])
    st().moveSeam(a.id, 1)
    expect(st().seams.map((s) => s.name)).toEqual(['S-04', 'S-01'])
  })

  test('manual: duplicate clicks ignored, clicking near the first point closes the loop', async () => {
    await ready()
    st().setMode('manual')
    st().addManualPoint([0, 0, 0], up)
    st().addManualPoint([0, 0, 0.01], up) // double-click on the same spot
    st().addManualPoint([10, 0, 0], up)
    st().addManualPoint([10, 10, 0], up)
    st().addManualPoint([0.05, 0, 0], up) // back at the start
    const seam = st().seams[0]
    expect(seam).toMatchObject({ source: 'manual', closed: true })
    expect(seam.points).toHaveLength(3)
    expect(st().manualPoints).toHaveLength(0)
  })

  test('replacing or closing a part with seams asks first', async () => {
    await ready('a.stl')
    st().addSeamFromCandidate(0)
    await st().loadFile(stl('b.stl'))
    expect(st().pending?.message).toMatch(/1 seam will be lost/)
    expect(h.loads).toHaveLength(1) // nothing loaded yet
    st().cancelPending()
    expect(st().part?.name).toBe('a.stl')
    st().clearPart()
    expect(st().pending?.confirm).toBe('New part')
    st().confirmPending()
    expect(st().part).toBeNull()
  })

  test('apply-to-type copies parameters to seams of the same weld type only', async () => {
    await ready('a.stl', 4)
    for (const i of [0, 2, 3]) {
      st().selectSeam(null)
      st().addSeamFromCandidate(i)
    }
    const [a, b, c] = st().seams
    st().updateParams(c.id, { weldType: 'butt' })
    st().updateParams(a.id, { travelSpeedMmS: 9, passes: 2 })
    st().applyParamsToType(a.id)
    expect(st().seams.find((s) => s.id === b.id)!.params).toMatchObject({ travelSpeedMmS: 9, passes: 2 })
    expect(st().seams.find((s) => s.id === c.id)!.params.travelSpeedMmS).toBe(6)
  })

  test('import: a different part is refused unless forced; with seams present it asks first', async () => {
    await ready('a.stl', 4)
    st().addSeamFromCandidate(0)
    st().addSeamFromCandidate(2)
    const job = toWeldJob({ part: { ...st().part!, units: 'in' }, seams: st().seams, job: st().job })
    const other = { ...job, part: { ...job.part, sha256: 'different', fileName: 'other.stl' } }
    expect(st().importJob(other)).toMatchObject({ ok: false, mismatch: 'other.stl' })
    expect(st().importJob(other, true)).toEqual({ ok: true })
    expect(st().pending?.confirm).toBe('Import')
    st().confirmPending()
    expect(st().seams).toHaveLength(2)
    expect(st().part?.units).toBe('in') // the job's units come with it
    expect(st().seams[0].points[1][0]).toBeCloseTo(10) // inches in the file → part units back
  })
})
