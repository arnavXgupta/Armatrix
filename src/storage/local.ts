import type { PlanDocument, PlanStore, Result } from './types'

export const PLAN_KEY = 'wsp:plan'
const DB_NAME = 'weld-planner'
const FILES = 'files'

const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = (e: unknown): Result<never> => {
  const name = (e as { name?: string } | null)?.name
  const reason =
    name === 'QuotaExceededError'
      ? 'browser storage is full'
      : name === 'SecurityError'
        ? 'storage is blocked in this window'
        : e instanceof Error
          ? e.message
          : String(e)
  return { ok: false, reason }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(FILES, { keyPath: 'sha256' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
  })
}

/** One transaction on the files store; resolves with the last request's result when it commits. */
async function files<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(FILES, mode)
    const req = run(t.objectStore(FILES))
    t.oncomplete = () => {
      db.close()
      resolve(req ? req.result : undefined)
    }
    t.onerror = t.onabort = () => {
      db.close()
      reject(t.error)
    }
  })
}

/**
 * Plan document in localStorage (small, synchronous, so a save can be flushed on unload);
 * STL bytes in IndexedDB (localStorage caps near 5 MB). `ls` is injectable for tests.
 */
export function createLocalStore(ls: () => Storage | undefined = () => globalThis.localStorage): PlanStore {
  const storage = () => {
    const s = ls() // reading window.localStorage itself throws when storage is blocked
    if (!s) throw new Error('localStorage is not available')
    return s
  }
  return {
    async savePlan(doc) {
      try {
        storage().setItem(PLAN_KEY, JSON.stringify(doc)) // synchronous: calling without await still writes now
        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    },
    async loadPlan() {
      try {
        const text = storage().getItem(PLAN_KEY)
        return ok(text ? (JSON.parse(text) as PlanDocument) : null)
      } catch (e) {
        return fail(e)
      }
    },
    async clearPlan() {
      try {
        storage().removeItem(PLAN_KEY)
        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    },
    async saveFile(sha256, name, bytes) {
      try {
        await files('readwrite', (s) => {
          s.clear()
          return s.put({ sha256, name, bytes, savedAt: new Date().toISOString() })
        })
        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    },
    async loadFile(sha256) {
      try {
        const row = (await files('readonly', (s) => s.get(sha256))) as { name: string; bytes: Blob } | undefined
        return ok(row ? { name: row.name, bytes: row.bytes } : null)
      } catch (e) {
        return fail(e)
      }
    },
    async clearFiles() {
      try {
        await files('readwrite', (s) => {
          s.clear()
        })
        return ok(undefined)
      } catch (e) {
        return fail(e)
      }
    },
  }
}
