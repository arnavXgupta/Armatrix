import type { WeldJob } from '../export/schema'
import type { Units } from '../geometry/parseStl'

/** What autosave writes: the export document itself plus the bits of UI state worth restoring. */
export type PlanDocument = {
  savedAt: string
  job: WeldJob // from toWeldJob, even while validation has errors
  ui: { angleThreshold: number; units: Units; selectedSeamId: string | null }
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string }

/** All persistence goes through this. Methods never throw; failures come back as { ok: false }. */
export type PlanStore = {
  savePlan(doc: PlanDocument): Promise<Result<void>>
  loadPlan(): Promise<Result<PlanDocument | null>>
  clearPlan(): Promise<Result<void>>
  /** Keeps only this file: storing a new part drops the previous one so the quota stays bounded. */
  saveFile(sha256: string, name: string, bytes: Blob): Promise<Result<void>>
  loadFile(sha256: string): Promise<Result<{ name: string; bytes: Blob } | null>>
  clearFiles(): Promise<Result<void>>
}
