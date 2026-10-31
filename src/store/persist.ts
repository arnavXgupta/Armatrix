import { parseWeldJob } from '../export/fromWeldJob'
import { toWeldJob } from '../export/toWeldJob'
import { storage } from '../storage'
import type { PlanDocument } from '../storage/types'
import { useStore, type StoreState } from './useStore'

const SAVE_DELAY_MS = 300

/** The persisted document is the export document plus a little UI state: one format, one reader. */
export function toPlanDocument(s: StoreState, savedAt = new Date().toISOString()): PlanDocument | null {
  if (!s.part) return null
  return {
    savedAt,
    job: toWeldJob({ part: s.part, seams: s.seams, job: s.job, createdAt: savedAt }),
    ui: { angleThreshold: s.ui.angleThreshold, units: s.part.units, selectedSeamId: s.selectedSeamId },
  }
}

/** Shape-check a stored document; anything unreadable is treated as no plan. */
export function readPlanDocument(raw: unknown): PlanDocument | null {
  try {
    const doc = raw as PlanDocument
    if (!doc?.ui || typeof doc.ui.angleThreshold !== 'number') return null
    parseWeldJob(JSON.stringify(doc.job))
    return doc
  } catch {
    return null
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let dirty = false

/** Write now if a save is waiting. localStorage is synchronous, so this is safe in pagehide. */
export function flushAutosave() {
  if (!dirty) return
  dirty = false
  clearTimeout(timer)
  const doc = toPlanDocument(useStore.getState())
  if (!doc) return
  void storage.savePlan(doc).then((r) => {
    if ((r.ok ? null : r.reason) !== useStore.getState().autosaveError) useStore.setState({ autosaveError: r.ok ? null : r.reason })
  })
}

/** Debounced save whenever the plan changes. Returns an unsubscribe. */
export function startAutosave(): () => void {
  const unsubscribe = useStore.subscribe((s, prev) => {
    if (!s.part) return
    const changed =
      s.seams !== prev.seams ||
      s.job !== prev.job ||
      s.part !== prev.part ||
      s.selectedSeamId !== prev.selectedSeamId ||
      s.ui.angleThreshold !== prev.ui.angleThreshold
    if (!changed) return
    dirty = true
    clearTimeout(timer)
    timer = setTimeout(flushAutosave, SAVE_DELAY_MS)
  })
  window.addEventListener('pagehide', flushAutosave)
  return () => {
    unsubscribe()
    window.removeEventListener('pagehide', flushAutosave)
  }
}

/** On boot: bring back the last plan and its part. If the bytes are gone, the drop zone asks for the file. */
export async function restoreOnBoot() {
  const plan = await storage.loadPlan()
  if (!plan.ok) return useStore.setState({ autosaveError: plan.reason })
  const doc = readPlanDocument(plan.value)
  if (!doc) {
    if (plan.value) void storage.clearPlan()
    return
  }
  if (useStore.getState().part) return // the user already dropped a file
  const file = await storage.loadFile(doc.job.part.sha256)
  if (useStore.getState().part) return
  if (file.ok && file.value) await useStore.getState().loadFile(new File([file.value.bytes], file.value.name), { restore: doc })
  else useStore.setState({ savedPlan: doc })
}
