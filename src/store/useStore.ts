import { create } from 'zustand'
import { defaultParams } from '../export/defaults'
import { seamsFromJob } from '../export/fromWeldJob'
import type { WeldJob, WeldParams } from '../export/schema'
import type { JobMeta } from '../export/toWeldJob'
import { bboxDiagonal, guessUnits, type Units } from '../geometry/parseStl'
import type { Bbox, Candidate, RawMesh, Vec3 } from '../geometry/types'
import { storage } from '../storage'
import { formatLength } from '../ui/format'
import type { PlanDocument } from '../storage/types'
import { CancelledError, candidatesInWorker, loadInWorker, workerEpoch } from '../workers/geometryClient'
import { EMPTY_HISTORY, record, redo as redoStep, undo as undoStep, type History, type Snapshot } from './history'
import { flipSeam, joinSeam, newId, seamFromCandidate, seamFromPoints, seamName, seamOwners, type Seam } from './seams'
import { airTravel, orderByNearest as nearestOrder } from './sequence'

export const MAX_FILE_BYTES = 250 * 1024 * 1024
export const BIG_PART_TRIANGLES = 2_000_000

export type Part = {
  name: string
  sizeBytes: number
  sha256: string // '' when the page is not a secure context (no crypto.subtle)
  format: RawMesh['format']
  triangles: number
  dropped: number
  vertices: number
  nonManifold: number
  bbox: Bbox
  units: Units
  unitsGuessed: boolean
}
export type Status = { kind: 'idle' | 'loading' | 'ready' | 'restored' | 'error'; message: string; progress?: number }
export type Mode = 'pick' | 'manual'
/** An action waiting for the user's yes in the confirm bar. */
export type Pending = { message: string; confirm: string; run: () => void }
type Ui = { wireframe: boolean; ortho: boolean; showCandidates: boolean; angleThreshold: number }
type Toggle = 'wireframe' | 'ortho' | 'showCandidates'
export type ImportResult = { ok: true } | { ok: false; error: string; mismatch?: string }

export type StoreState = {
  part: Part | null
  mesh: RawMesh | null // not persisted; the file bytes are (IndexedDB)
  candidates: Candidate[] // id === index, longest first
  candidatesDeg: number | null // threshold the current candidates were computed at; null until the first result
  candidatesMs: number | null
  status: Status
  ui: Ui

  seams: Seam[] // array order = weld order
  seamCounter: number // next S-NN; never reused after a delete
  selectedSeamId: string | null
  past: Snapshot[] // undo stack: seam edits on this part, newest last; not persisted
  future: Snapshot[] // redo stack
  hoverCandidateId: number | null
  mode: Mode
  manualPoints: { p: Vec3; n: Vec3 }[]
  pending: Pending | null
  notice: string | null // short-lived warning or confirmation in the status bar
  job: JobMeta
  exportOpen: boolean
  helpOpen: boolean
  savedPlan: PlanDocument | null // restored plan whose STL bytes are missing: waits for the file
  autosaveError: string | null

  loadFile(file: File, opts?: { force?: boolean; restore?: PlanDocument }): Promise<void>
  clearPart(force?: boolean): void
  setUnits(units: 'mm' | 'in' | 'm'): void
  toggle(key: Toggle): void
  setThreshold(deg: number): void

  setHover(id: number | null): void
  setMode(mode: Mode): void
  addSeamFromCandidate(id: number): void
  joinCandidate(id: number): void
  addManualPoint(p: Vec3, n: Vec3): void
  undoManualPoint(): void
  finishManual(closed?: boolean): void
  cancelManual(): void
  selectSeam(id: string | null): void
  selectAdjacent(delta: 1 | -1): void
  renameSeam(id: string, name: string): void
  flipSeam(id: string): void
  removeSeam(id: string): void
  moveSeam(id: string, toIndex: number): void
  orderByNearest(): void
  undo(): void
  redo(): void

  updateParams(id: string, patch: Partial<WeldParams>): void
  resetParams(id: string): void
  applyParamsToType(id: string): void
  setNotes(id: string, notes: string): void
  setJob(patch: Partial<JobMeta>): void
  importJob(job: WeldJob, force?: boolean): ImportResult

  confirmPending(): void
  cancelPending(): void
  setNotice(message: string | null): void
  setExportOpen(open: boolean): void
  setHelpOpen(open: boolean): void
}

export const IDLE: Status = { kind: 'idle', message: 'Drop an .stl into the viewport to start.' }
const READY: Status = { kind: 'ready', message: '' }

let loadSeq = 0 // only the newest load may write to the store
let candSeq = 0 // only the newest candidates request may write
let partEpoch = -1 // worker epoch the current part was indexed in
let thresholdTimer: ReturnType<typeof setTimeout> | undefined
let noticeTimer: ReturnType<typeof setTimeout> | undefined

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) return ''
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Next free S-NN after the highest one in use. */
const nextCounter = (seams: Seam[]) =>
  Math.max(seams.length, ...seams.map((s) => Number(/^S-(\d+)$/.exec(s.name)?.[1] ?? 0))) + 1

/** Join and close-the-loop tolerance, and the stricter one for matching candidates to seams. */
export const joinTol = (part: Part | null) => (part ? bboxDiagonal(part.bbox) * 0.002 : 0)
export const ownerEps = (part: Part | null) => (part ? bboxDiagonal(part.bbox) * 1e-5 : 0)

const newJob = (prev?: JobMeta): JobMeta => ({ id: newId(), name: '', operator: prev?.operator ?? '', notes: '' })

export const useStore = create<StoreState>()((set, get) => {
  const fail = (message: string) => set({ status: { kind: 'error', message } })
  // If the worker was replaced since this part loaded, it no longer holds the part's edges.
  const dropPartIfOrphaned = () => {
    if (get().part && workerEpoch() !== partEpoch)
      set({ part: null, mesh: null, candidates: [], candidatesDeg: null, candidatesMs: null, seams: [], selectedSeamId: null, ...EMPTY_HISTORY })
  }
  /** Seam edits: clear a stale error or "restored" banner, keep everything else. */
  const editSeams = (patch: Partial<StoreState>) => {
    const k = get().status.kind
    set({ ...patch, ...(k === 'error' || k === 'restored' ? { status: READY } : {}) })
  }
  const snapshot = (): Snapshot => ({ seams: get().seams, selectedSeamId: get().selectedSeamId, seamCounter: get().seamCounter })
  const history = (): History => ({ past: get().past, future: get().future })
  /** An undoable seam edit: remember the state before it, then apply it. */
  const commit = (patch: Partial<StoreState>) => editSeams({ ...record(history(), snapshot()), ...patch })
  const step = (r: ReturnType<typeof undoStep>) => r && editSeams({ ...r.snapshot, ...r.history })
  const seamById = (id: string) => get().seams.find((s) => s.id === id)
  const mapSeam = (id: string, fn: (s: Seam) => Seam) => commit({ seams: get().seams.map((s) => (s.id === id ? fn(s) : s)) })
  const notice = (message: string) => get().setNotice(message)

  async function refreshCandidates() {
    const seq = ++candSeq
    const deg = get().ui.angleThreshold
    try {
      const { candidates, ms } = await candidatesInWorker(deg)
      if (seq !== candSeq) return
      set({ candidates, candidatesDeg: deg, candidatesMs: ms, hoverCandidateId: null, ...(get().status.kind === 'error' ? { status: READY } : {}) })
    } catch (e) {
      if (seq !== candSeq || e instanceof CancelledError) return
      dropPartIfOrphaned()
      fail(`Could not compute candidate seams. ${errorText(e)}`)
    }
  }

  return {
    part: null,
    mesh: null,
    candidates: [],
    candidatesDeg: null,
    candidatesMs: null,
    status: IDLE,
    ui: { wireframe: false, ortho: false, showCandidates: true, angleThreshold: 30 },
    seams: [],
    seamCounter: 1,
    selectedSeamId: null,
    ...EMPTY_HISTORY,
    hoverCandidateId: null,
    mode: 'pick',
    manualPoints: [],
    pending: null,
    notice: null,
    job: newJob(),
    exportOpen: false,
    helpOpen: false,
    savedPlan: null,
    autosaveError: null,

    async loadFile(file, { force = false, restore } = {}) {
      if (!/\.stl$/i.test(file.name)) return fail(`${file.name} is not an .stl file. Choose an .stl part.`)
      if (file.size === 0) return fail(`${file.name} is empty.`)
      if (file.size > MAX_FILE_BYTES) {
        return fail(`${file.name} is ${Math.round(file.size / 1048576)} MB. The limit is 250 MB; decimate the mesh and try again.`)
      }
      const before = get()
      if (!force && !restore && before.seams.length > 0) {
        const n = before.seams.length
        set({
          pending: {
            message: `Replace ${before.part?.name ?? 'the part'} with ${file.name}? Its ${n} ${n === 1 ? 'seam' : 'seams'} will be lost.`,
            confirm: 'Replace',
            run: () => void get().loadFile(file, { force: true }),
          },
        })
        return
      }
      const seq = ++loadSeq
      const prevStatus = before.status
      set({ status: { kind: 'loading', message: `Reading ${file.name}`, progress: 0 }, pending: null })
      try {
        const buffer = await file.arrayBuffer()
        const sha256 = await sha256Hex(buffer) // before the buffer is transferred to the worker
        if (seq !== loadSeq) return

        // A saved plan waiting for its part: the matching file restores it, another file asks first.
        let doc = restore
        const saved = get().savedPlan
        if (!doc && saved) {
          if (saved.job.part.sha256 === sha256) doc = saved
          else if (!force) {
            set({
              status: prevStatus,
              pending: {
                message: `Discard the saved plan for ${saved.job.part.fileName} (${saved.job.seams.length} seams) and open ${file.name}?`,
                confirm: 'Discard plan',
                run: () => void get().loadFile(file, { force: true }),
              },
            })
            return
          }
        }

        const { mesh, vertices, nonManifold } = await loadInWorker(buffer, (stage, value) => {
          if (seq !== loadSeq) return
          const status: Status =
            stage === 'parse'
              ? { kind: 'loading', message: `Parsing ${file.name}`, progress: 0.05 + value * 0.6 }
              : { kind: 'loading', message: `Finding edges in ${file.name}`, progress: 0.7 }
          set({ status })
        })
        if (seq !== loadSeq) return
        partEpoch = workerEpoch()

        const seams = doc ? seamsFromJob(doc.job) : []
        const selected = doc?.ui.selectedSeamId && seams.some((s) => s.id === doc.ui.selectedSeamId) ? doc.ui.selectedSeamId : null
        const prevJob = get().job
        set({
          part: {
            name: file.name,
            sizeBytes: file.size,
            sha256,
            format: mesh.format,
            triangles: mesh.triangles,
            dropped: mesh.dropped,
            vertices,
            nonManifold,
            bbox: mesh.bbox,
            units: doc ? doc.ui.units : guessUnits(mesh.bbox),
            unitsGuessed: !doc,
          },
          mesh,
          candidates: [],
          candidatesDeg: null,
          candidatesMs: null,
          seams,
          seamCounter: nextCounter(seams),
          selectedSeamId: selected,
          ...EMPTY_HISTORY,
          hoverCandidateId: null,
          mode: 'pick',
          manualPoints: [],
          job: doc
            ? { id: doc.job.jobId, name: doc.job.name, operator: doc.job.operator ?? '', notes: doc.job.notes ?? '' }
            : newJob(prevJob),
          ui: doc ? { ...get().ui, angleThreshold: doc.ui.angleThreshold } : get().ui,
          savedPlan: null,
          notice: null,
          status: doc
            ? { kind: 'restored', message: `saved ${new Date(doc.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }
            : READY,
        })
        if (!restore) {
          // keep the bytes so a reload restores the part (restores from IndexedDB already have them)
          void storage.saveFile(sha256, file.name, file).then((r) => {
            if (!r.ok) set({ autosaveError: r.reason })
          })
        }
        await refreshCandidates()
      } catch (e) {
        if (seq !== loadSeq || e instanceof CancelledError) return
        dropPartIfOrphaned() // otherwise the previous part stays: a bad drop never costs work
        if (restore) set({ savedPlan: restore }) // the plan is still there; dropping the file again retries
        fail(`Could not open ${file.name}. ${errorText(e)}`)
      }
    },

    clearPart(force = false) {
      const { seams } = get()
      if (!force && seams.length > 0) {
        set({
          pending: {
            message: `Start a new part? The ${seams.length} ${seams.length === 1 ? 'seam' : 'seams'} on this one will be lost.`,
            confirm: 'New part',
            run: () => get().clearPart(true),
          },
        })
        return
      }
      loadSeq++
      candSeq++
      clearTimeout(thresholdTimer)
      set({
        part: null,
        mesh: null,
        candidates: [],
        candidatesDeg: null,
        candidatesMs: null,
        seams: [],
        seamCounter: 1,
        selectedSeamId: null,
        ...EMPTY_HISTORY,
        hoverCandidateId: null,
        mode: 'pick',
        manualPoints: [],
        pending: null,
        notice: null,
        savedPlan: null,
        exportOpen: false,
        status: IDLE,
      })
      void storage.clearPlan()
      void storage.clearFiles()
    },

    setUnits(units) {
      const part = get().part
      if (part) set({ part: { ...part, units, unitsGuessed: false } })
    },

    toggle(key) {
      set({ ui: { ...get().ui, [key]: !get().ui[key] }, ...(key === 'showCandidates' ? { hoverCandidateId: null } : {}) })
    },

    setThreshold(deg) {
      set({ ui: { ...get().ui, angleThreshold: deg } })
      clearTimeout(thresholdTimer)
      if (get().part) thresholdTimer = setTimeout(refreshCandidates, 80)
    },

    setHover(id) {
      if (get().hoverCandidateId !== id) set({ hoverCandidateId: id })
    },

    setMode(mode) {
      if (get().mode !== mode) set({ mode, manualPoints: [], hoverCandidateId: null })
    },

    addSeamFromCandidate(id) {
      const s = get()
      const c = s.candidates[id]
      if (!c || !s.part) return
      const owner = seamOwners([c], s.seams, ownerEps(s.part)).get(id)
      if (owner) {
        set({ selectedSeamId: owner === s.selectedSeamId ? null : owner })
        return
      }
      const seam = seamFromCandidate(c, newId(), seamName(s.seamCounter), defaultParams())
      commit({ seams: [...s.seams, seam], seamCounter: s.seamCounter + 1, selectedSeamId: seam.id, notice: null })
    },

    joinCandidate(id) {
      const s = get()
      const c = s.candidates[id]
      const sel = s.selectedSeamId ? seamById(s.selectedSeamId) : undefined
      if (!c || !s.part) return
      if (!sel) return get().addSeamFromCandidate(id)
      const owner = seamOwners([c], s.seams, ownerEps(s.part)).get(id)
      if (owner) return notice(owner === sel.id ? `That edge is already part of ${sel.name}.` : `That edge already belongs to ${seamById(owner)?.name}.`)
      if (sel.closed) return notice(`${sel.name} is a closed loop; it cannot be extended.`)
      const joined = joinSeam(sel, c.points, c.normals, joinTol(s.part))
      if (!joined) return notice(`Not connected to ${sel.name}. Pick an edge that touches one of its ends.`)
      mapSeam(sel.id, () => joined)
    },

    addManualPoint(p, n) {
      const { manualPoints: pts, part } = get()
      const tol = joinTol(part)
      if (pts.length && dist(p, pts[pts.length - 1].p) <= tol) return // double-click lands twice on one spot
      if (pts.length >= 3 && dist(p, pts[0].p) <= tol) return get().finishManual(true) // back at the start: close
      set({ manualPoints: [...pts, { p, n }] })
    },

    undoManualPoint() {
      set({ manualPoints: get().manualPoints.slice(0, -1) })
    },

    finishManual(closed = false) {
      const s = get()
      const pts = s.manualPoints
      if (pts.length < 2) return notice('A manual seam needs at least 2 points.')
      const seam = seamFromPoints(
        pts.map((m) => m.p),
        pts.map((m) => m.n),
        closed && pts.length >= 3,
        newId(),
        seamName(s.seamCounter),
        defaultParams(),
      )
      commit({ seams: [...s.seams, seam], seamCounter: s.seamCounter + 1, selectedSeamId: seam.id, manualPoints: [] })
    },

    cancelManual() {
      set({ manualPoints: [] })
    },

    selectSeam(id) {
      set({ selectedSeamId: id })
    },

    selectAdjacent(delta) {
      const { seams, selectedSeamId } = get()
      if (!seams.length) return
      const i = seams.findIndex((s) => s.id === selectedSeamId)
      const next = i < 0 ? (delta > 0 ? 0 : seams.length - 1) : Math.min(seams.length - 1, Math.max(0, i + delta))
      set({ selectedSeamId: seams[next].id })
    },

    renameSeam(id, name) {
      const trimmed = name.trim()
      if (trimmed && trimmed !== seamById(id)?.name) mapSeam(id, (s) => ({ ...s, name: trimmed }))
    },

    flipSeam(id) {
      mapSeam(id, flipSeam)
    },

    removeSeam(id) {
      const s = get()
      if (seamById(id)) commit({ seams: s.seams.filter((x) => x.id !== id), selectedSeamId: s.selectedSeamId === id ? null : s.selectedSeamId })
    },

    moveSeam(id, toIndex) {
      const seams = [...get().seams]
      const from = seams.findIndex((s) => s.id === id)
      if (from < 0) return
      const to = Math.min(seams.length - 1, Math.max(0, toIndex))
      if (from === to) return
      const [seam] = seams.splice(from, 1)
      seams.splice(to, 0, seam)
      commit({ seams })
    },

    orderByNearest() {
      const { seams, part } = get()
      if (seams.length < 2) return
      const next = nearestOrder(seams)
      const before = airTravel(seams), after = airTravel(next)
      const len = (v: number) => formatLength(v, part?.units)
      if (after >= before - 1e-9 * (1 + before)) return notice(`No shorter order found; air travel stays ${len(before)}.`)
      const flipped = next.filter((s) => !seams.includes(s)).length
      commit({ seams: next })
      notice(`Reordered: air travel ${len(before)} → ${len(after)}${flipped ? `, ${flipped} ${flipped === 1 ? 'seam' : 'seams'} reversed` : ''}.`)
    },

    undo() {
      step(undoStep(history(), snapshot()))
    },

    redo() {
      step(redoStep(history(), snapshot()))
    },

    updateParams(id, patch) {
      mapSeam(id, (s) => ({ ...s, params: { ...s.params, ...patch } }))
    },

    resetParams(id) {
      mapSeam(id, (s) => ({ ...s, params: defaultParams(s.params.weldType, s.params.process) }))
    },

    applyParamsToType(id) {
      const src = seamById(id)
      if (!src) return
      const type = src.params.weldType
      let n = 0
      const seams = get().seams.map((s) => {
        if (s.id === src.id || s.params.weldType !== type) return s
        n++
        return { ...s, params: { ...src.params, weave: { ...src.params.weave } } }
      })
      if (n) commit({ seams })
      notice(n ? `Copied ${src.name}'s parameters to ${n} other ${type} ${n === 1 ? 'seam' : 'seams'}.` : `No other ${type} seams to update.`)
    },

    setNotes(id, notes) {
      if (notes !== (seamById(id)?.notes ?? '')) mapSeam(id, (s) => ({ ...s, notes }))
    },

    setJob(patch) {
      set({ job: { ...get().job, ...patch } })
    },

    importJob(job, force = false) {
      const s = get()
      if (!s.part) return { ok: false, error: 'Load the part first; a plan needs its mesh.' }
      if (!force && job.part.sha256 !== s.part.sha256) {
        return { ok: false, error: `This plan was made for a different part (${job.part.fileName}).`, mismatch: job.part.fileName }
      }
      let seams: Seam[]
      try {
        seams = seamsFromJob(job)
      } catch (e) {
        return { ok: false, error: errorText(e) }
      }
      const apply = () => {
        commit({
          seams,
          seamCounter: nextCounter(seams),
          selectedSeamId: null,
          manualPoints: [],
          part: { ...get().part!, units: job.part.sourceUnits, unitsGuessed: false },
          job: { id: job.jobId, name: job.name, operator: job.operator ?? '', notes: job.notes ?? '' },
        })
        notice(`Imported ${seams.length} ${seams.length === 1 ? 'seam' : 'seams'} from ${job.name}.`)
      }
      if (s.seams.length) {
        set({ pending: { message: `Import ${job.name}? It replaces the ${s.seams.length} seams in this plan.`, confirm: 'Import', run: apply } })
      } else apply()
      return { ok: true }
    },

    confirmPending() {
      const p = get().pending
      set({ pending: null })
      p?.run()
    },

    cancelPending() {
      set({ pending: null })
    },

    setNotice(message) {
      clearTimeout(noticeTimer)
      set({ notice: message })
      if (message) noticeTimer = setTimeout(() => set({ notice: null }), 6000)
    },

    setExportOpen(open) {
      set({ exportOpen: open })
    },

    setHelpOpen(open) {
      set({ helpOpen: open })
    },
  }
})
