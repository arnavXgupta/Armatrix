import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { Scene } from './Scene'
import ViewToolbar from './ViewToolbar'

export default function Viewport() {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<Scene | null>(null)
  const [glError, setGlError] = useState<string | null>(null)
  const mesh = useStore((s) => s.mesh)
  const candidates = useStore((s) => s.candidates)
  const { wireframe, ortho, showCandidates } = useStore((s) => s.ui)

  useEffect(() => {
    let s: Scene
    try {
      s = new Scene(host.current!, () => setGlError('The 3D view lost its graphics context. Reload the page to continue.'))
    } catch {
      // oxlint-disable-next-line react/set-state-in-effect -- reporting that the external WebGL setup failed
      setGlError('The 3D view needs WebGL, which this browser has turned off or does not support.')
      return
    }
    scene.current = s
    return () => {
      s.dispose()
      scene.current = null
    }
  }, [])

  // Order matters on mount: mesh first (it fits the camera), then the view options.
  useEffect(() => scene.current?.setMesh(mesh), [mesh])
  useEffect(() => scene.current?.setCandidates(candidates), [candidates])
  useEffect(() => scene.current?.setCandidatesVisible(showCandidates), [showCandidates])
  useEffect(() => scene.current?.setWireframe(wireframe), [wireframe])
  useEffect(() => scene.current?.setOrtho(ortho), [ortho])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'r' || e.key === 'R') scene.current?.fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="viewport-stage">
      <div ref={host} className="viewport-canvas" />
      {glError ? (
        <p className="viewport-message" role="alert">
          {glError}
        </p>
      ) : (
        <ViewToolbar onFit={() => scene.current?.fit()} />
      )}
    </div>
  )
}
