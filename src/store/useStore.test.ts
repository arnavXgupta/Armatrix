import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { RawMesh } from '../geometry/types'

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

const { useStore } = await import('./useStore')

const stl = (name: string) => new File([new Uint8Array(84 + 50)], name)
const mesh = (): RawMesh => ({
  positions: new Float32Array(9),
  triangles: 1,
  dropped: 0,
  format: 'binary',
  bbox: { min: [0, 0, 0], max: [100, 50, 20] },
})
const loaded = () => ({ mesh: mesh(), vertices: 3, nonManifold: 0 })
const cands = (n: number) => ({ candidates: Array.from({ length: n }, (_, id) => ({ id })), ms: 1 })
const flush = () => new Promise((r) => setTimeout(r, 0))
/** Wait until the store has called the worker n times for loads. */
const loadsSent = async (n: number) => {
  for (let i = 0; i < 50 && h.loads.length < n; i++) await flush()
  expect(h.loads).toHaveLength(n)
}

beforeEach(() => {
  h.loads.length = 0
  h.cands.length = 0
  h.epoch = 0
  useStore.getState().clearPart()
})

describe('store', () => {
  test('rejects a non-STL name without touching the worker', async () => {
    await useStore.getState().loadFile(stl('part.obj'))
    expect(useStore.getState().status).toMatchObject({ kind: 'error', message: expect.stringMatching(/not an \.stl/) })
    expect(h.loads).toHaveLength(0)
  })

  test('happy path: part, units guess, then candidates with their angle', async () => {
    const done = useStore.getState().loadFile(stl('a.stl'))
    await loadsSent(1)
    h.loads[0].resolve(loaded())
    await flush()
    expect(useStore.getState().part).toMatchObject({ name: 'a.stl', units: 'mm', unitsGuessed: true })
    expect(useStore.getState().candidatesDeg).toBeNull()
    h.cands[0].resolve(cands(3))
    await done
    expect(useStore.getState()).toMatchObject({ candidatesDeg: 30, status: { kind: 'ready' } })
    expect(useStore.getState().candidates).toHaveLength(3)
  })

  test('a newer file wins even if the older one finishes last', async () => {
    void useStore.getState().loadFile(stl('old.stl'))
    await loadsSent(1)
    void useStore.getState().loadFile(stl('new.stl'))
    await loadsSent(2)
    h.loads[1].resolve(loaded())
    await flush()
    h.loads[0].resolve(loaded())
    await flush()
    expect(useStore.getState().part?.name).toBe('new.stl')
  })

  test('only the newest candidates request is applied', async () => {
    void useStore.getState().loadFile(stl('a.stl'))
    await loadsSent(1)
    h.loads[0].resolve(loaded())
    await flush()
    h.cands[0].resolve(cands(1))
    await flush()
    vi.useFakeTimers()
    useStore.getState().setThreshold(10)
    vi.advanceTimersByTime(100)
    useStore.getState().setThreshold(60)
    vi.advanceTimersByTime(100)
    vi.useRealTimers()
    expect(h.cands).toHaveLength(3)
    h.cands[2].resolve(cands(5)) // 60°
    await flush()
    h.cands[1].resolve(cands(9)) // 10°, stale
    await flush()
    expect(useStore.getState()).toMatchObject({ candidatesDeg: 60 })
    expect(useStore.getState().candidates).toHaveLength(5)
  })

  test('a failed load keeps the previous part, unless the worker lost it', async () => {
    void useStore.getState().loadFile(stl('good.stl'))
    await loadsSent(1)
    h.loads[0].resolve(loaded())
    await flush()

    void useStore.getState().loadFile(stl('bad.stl'))
    await loadsSent(2)
    h.loads[1].reject(new Error('This is not a readable STL.'))
    await flush()
    expect(useStore.getState().part?.name).toBe('good.stl')
    expect(useStore.getState().status).toMatchObject({ kind: 'error', message: expect.stringMatching(/bad\.stl/) })

    void useStore.getState().loadFile(stl('crash.stl'))
    await loadsSent(3)
    h.epoch++ // worker replaced: it no longer holds good.stl's edges
    h.loads[2].reject(new Error('The geometry worker stopped unexpectedly.'))
    await flush()
    expect(useStore.getState().part).toBeNull()
  })
})
