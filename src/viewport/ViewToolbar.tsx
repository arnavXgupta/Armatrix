import { useStore } from '../store/useStore'

export default function ViewToolbar({ onFit }: { onFit: () => void }) {
  const ui = useStore((s) => s.ui)
  const mode = useStore((s) => s.mode)
  const points = useStore((s) => s.manualPoints.length)
  const toggle = useStore((s) => s.toggle)
  const setMode = useStore((s) => s.setMode)
  const setThreshold = useStore((s) => s.setThreshold)
  const finishManual = useStore((s) => s.finishManual)
  const cancelManual = useStore((s) => s.cancelManual)
  const count = useStore((s) => s.candidates.length)

  return (
    <div className="view-toolbar" role="toolbar" aria-label="View">
      <span className="tool-group" role="group" aria-label="Mode">
        <button type="button" className="tool" aria-pressed={mode === 'pick'} onClick={() => setMode('pick')} title="Pick detected edges (M toggles)">
          Pick
        </button>
        <button type="button" className="tool" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')} title="Click points on the part to draw a seam (M)">
          Manual
        </button>
      </span>
      {mode === 'manual' ? (
        <>
          <span className="tool-hint">
            {points === 0 ? 'Click points on the part' : `${points} ${points === 1 ? 'point' : 'points'} · click the first point to close`}
          </span>
          <button type="button" className="tool tool-action" onClick={() => finishManual()} disabled={points < 2} title="Finish the seam (Enter or double-click)">
            Finish
          </button>
          <button type="button" className="tool" onClick={cancelManual} disabled={points === 0} title="Discard the points (Esc)">
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" className="tool" onClick={onFit} title="Fit the part in view (R)">
            Fit
          </button>
          <button type="button" className="tool" aria-pressed={ui.wireframe} onClick={() => toggle('wireframe')} title="Wireframe">
            Wire
          </button>
          <button type="button" className="tool" aria-pressed={ui.ortho} onClick={() => toggle('ortho')} title="Orthographic projection">
            Ortho
          </button>
          <button type="button" className="tool" aria-pressed={ui.showCandidates} onClick={() => toggle('showCandidates')} title="Show candidate edges">
            Edges
          </button>
          <label className="tool-slider" title="Edges sharper than this angle become candidate seams. Open edges always show.">
            <span>Angle</span>
            <input type="range" min={5} max={90} step={1} value={ui.angleThreshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            <output>{ui.angleThreshold}°</output>
          </label>
          <span className="tool-count">
            {count.toLocaleString()} {count === 1 ? 'candidate' : 'candidates'}
          </span>
        </>
      )}
    </div>
  )
}
