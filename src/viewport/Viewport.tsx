import { useEffect, useRef, useState } from 'react'
import { seamOwners } from '../store/seams'
import { ownerEps, useStore } from '../store/useStore'
import { formatLength } from '../ui/format'
import { isTextEntry, isTyping } from '../ui/typing'
import { setActiveScene } from './api'
import { Scene, type ViewPreset } from './Scene'
import ViewToolbar, { ViewPresets } from './ViewToolbar'

const VIEW_KEYS: Record<string, ViewPreset> = { 1: 'top', 2: 'front', 3: 'right', 4: 'iso' }
const HINT_KEY = 'wsp:hintSeen'
const hintSeen = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return true
  }
}

export default function Viewport() {
  const host = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const scene = useRef<Scene | null>(null)
  const [glError, setGlError] = useState<string | null>(null)
  const [hint, setHint] = useState(() => !hintSeen())
  const mesh = useStore((s) => s.mesh)
  const candidates = useStore((s) => s.candidates)
  const seams = useStore((s) => s.seams)
  const selectedSeamId = useStore((s) => s.selectedSeamId)
  const hoverId = useStore((s) => s.hoverCandidateId)
  const manualPoints = useStore((s) => s.manualPoints)
  const mode = useStore((s) => s.mode)
  const { wireframe, ortho, showCandidates } = useStore((s) => s.ui)

  useEffect(() => {
    let s: Scene
    try {
      s = new Scene(host.current!, {
        onContextLost: () => setGlError('The 3D view lost its graphics context. Reload the page; your plan is saved.'),
        onChipClick: (id) => useStore.getState().selectSeam(id),
      })
    } catch {
      // oxlint-disable-next-line react/set-state-in-effect -- reporting that the external WebGL setup failed
      setGlError('The 3D view needs WebGL, which this browser has turned off or does not support.')
      return
    }
    scene.current = s
    setActiveScene(s)
    if (import.meta.env.DEV) Object.assign(window, { __wsp: { scene: s, store: useStore } }) // test hook, dev only
    return () => {
      setActiveScene(null)
      s.dispose()
      scene.current = null
    }
  }, [])

  // Order matters on mount: mesh first (it fits the camera), then everything drawn on it.
  useEffect(() => scene.current?.setMesh(mesh), [mesh])
  useEffect(() => scene.current?.setCandidates(candidates), [candidates])
  useEffect(() => scene.current?.setCandidatesVisible(showCandidates), [showCandidates])
  useEffect(() => scene.current?.setWireframe(wireframe), [wireframe])
  useEffect(() => scene.current?.setOrtho(ortho), [ortho])
  useEffect(() => scene.current?.setHover(hoverId === null ? null : (candidates[hoverId] ?? null)), [hoverId, candidates])
  useEffect(() => scene.current?.setSeams(seams, selectedSeamId), [seams, selectedSeamId])
  useEffect(() => {
    if (selectedSeamId) scene.current?.pulse()
  }, [selectedSeamId])
  useEffect(() => scene.current?.setManual(manualPoints), [manualPoints])

  // The hint goes away for good once dismissed or once the first seam exists.
  const showHint = hint && seams.length === 0
  const rememberHint = () => {
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      /* storage blocked: the hint just comes back next session */
    }
  }
  const dismissHint = () => {
    setHint(false)
    rememberHint()
  }
  useEffect(() => {
    if (hint && seams.length > 0) rememberHint()
  }, [hint, seams.length])

  // Pointer: hover picks once per frame; a short, still press is a click, anything else is orbit.
  useEffect(() => {
    const el = host.current!
    const get = useStore.getState
    let down: { x: number; y: number; t: number; touch: boolean } | null = null
    let last: { x: number; y: number } | null = null
    let raf = 0

    const hideTip = () => {
      if (tip.current) tip.current.hidden = true
    }
    const showTip = (id: number, x: number, y: number) => {
      const t = tip.current
      const s = get()
      const c = s.candidates[id]
      if (!t || !c) return hideTip()
      const owner = seamOwners([c], s.seams, ownerEps(s.part)).get(id)
      const seam = owner ? s.seams.find((x) => x.id === owner) : undefined
      const what = c.kind === 'boundary' ? 'open edge' : `crease ${Math.round(c.meanAngleDeg)}°`
      const action = seam ? `${seam.name} · click to select` : s.selectedSeamId ? 'click to add · shift-click to join' : 'click to add'
      t.textContent = `${what} · ${formatLength(c.length, s.part?.units)} · ${action}`
      t.hidden = false
      // Below-right of the pointer; shifted left at the right edge and flipped above it at the bottom edge.
      const r = el.getBoundingClientRect()
      const left = Math.max(0, Math.min(x - r.left + 14, r.width - t.offsetWidth - 4))
      const below = y - r.top + 16
      const top = below + t.offsetHeight > r.height ? y - r.top - t.offsetHeight - 10 : below
      t.style.transform = `translate(${left}px, ${Math.max(0, top)}px)`
    }
    const hover = () => {
      raf = 0
      const s = get()
      if (!last || down || s.mode !== 'pick' || !scene.current) return
      const id = scene.current.pickCandidate(last.x, last.y)
      s.setHover(id)
      el.classList.toggle('is-over-edge', id !== null)
      if (id === null) hideTip()
      else showTip(id, last.x, last.y)
    }
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY }
      if (e.pointerType === 'mouse' && !raf) raf = requestAnimationFrame(hover)
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      down = { x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse' }
      hideTip()
    }
    const onUp = (e: PointerEvent) => {
      const d = down
      down = null
      if (!d || e.button !== 0 || !scene.current) return
      const still = Math.hypot(e.clientX - d.x, e.clientY - d.y) <= (d.touch ? 10 : 4)
      if (!still || performance.now() - d.t > (d.touch ? 500 : 300)) return
      const s = get()
      if (s.mode === 'manual') {
        const hit = scene.current.pickSurface(e.clientX, e.clientY)
        if (hit) s.addManualPoint(hit.p, hit.n)
        return
      }
      const id = scene.current.pickCandidate(e.clientX, e.clientY)
      if (id === null) s.selectSeam(null)
      else if (e.shiftKey) s.joinCandidate(id)
      else s.addSeamFromCandidate(id)
    }
    const onLeave = () => {
      last = null
      get().setHover(null)
      el.classList.remove('is-over-edge')
      hideTip()
    }
    const onDouble = () => {
      if (get().mode === 'manual') get().finishManual()
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('dblclick', onDouble)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('dblclick', onDouble)
    }
  }, [])

  // Keyboard: viewport and seam-list shortcuts (the ? help lives in App).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (s.exportOpen || s.helpOpen || e.altKey) return
      // Undo / redo: everywhere except text fields, which keep the browser's own text undo.
      if ((e.ctrlKey || e.metaKey) && !isTextEntry(e.target)) {
        const key = e.key.toLowerCase()
        const redo = key === 'y' || (key === 'z' && e.shiftKey)
        if (key !== 'z' && key !== 'y') return
        e.preventDefault()
        if (s.mode === 'manual' && s.manualPoints.length && !redo) s.undoManualPoint()
        else if (redo) s.redo()
        else s.undo()
        return
      }
      if (e.ctrlKey || e.metaKey) return
      if (VIEW_KEYS[e.key] && !isTextEntry(e.target)) {
        e.preventDefault()
        scene.current?.setView(VIEW_KEYS[e.key])
        return
      }
      if (isTyping(e.target)) return
      const sel = s.selectedSeamId
      const manual = s.mode === 'manual'
      let handled = true
      switch (e.key) {
        case 'r':
        case 'R':
          scene.current?.fit()
          break
        case 'm':
        case 'M':
          s.setMode(manual ? 'pick' : 'manual')
          break
        case 'f':
        case 'F':
          if (sel) s.flipSeam(sel)
          break
        case 'Enter':
          if (manual) s.finishManual()
          else handled = false
          break
        case 'Escape':
          if (s.pending) s.cancelPending()
          else if (manual && s.manualPoints.length) s.cancelManual()
          else if (manual) s.setMode('pick')
          else s.selectSeam(null)
          break
        case 'Backspace':
        case 'Delete':
          if (manual && s.manualPoints.length && e.key === 'Backspace') s.undoManualPoint()
          else if (sel) s.removeSeam(sel)
          break
        case 'ArrowUp':
        case 'ArrowDown': {
          const delta = e.key === 'ArrowUp' ? -1 : 1
          if (e.shiftKey && sel) s.moveSeam(sel, s.seams.findIndex((x) => x.id === sel) + delta)
          else s.selectAdjacent(delta)
          break
        }
        default:
          handled = false
      }
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={mode === 'manual' ? 'viewport-stage is-manual' : 'viewport-stage'}>
      <div ref={host} className="viewport-canvas">
        <div ref={tip} className="pick-tip" hidden />
      </div>
      {showHint && !glError && (
        <div className="first-hint" role="note">
          <span>Click a dark edge to add a seam · Shift-click to join edges · M to draw one by hand</span>
          <button type="button" className="hint-close" onClick={dismissHint} aria-label="Dismiss hint">
            ×
          </button>
        </div>
      )}
      {glError ? (
        <p className="viewport-message" role="alert">
          {glError}
        </p>
      ) : (
        <>
          <ViewPresets onView={(v) => scene.current?.setView(v)} />
          <ViewToolbar onFit={() => scene.current?.fit()} />
        </>
      )}
    </div>
  )
}
