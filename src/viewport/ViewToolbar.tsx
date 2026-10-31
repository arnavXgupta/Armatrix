import { useStore } from '../store/useStore'

export default function ViewToolbar({ onFit }: { onFit: () => void }) {
  const ui = useStore((s) => s.ui)
  const toggle = useStore((s) => s.toggle)
  const setThreshold = useStore((s) => s.setThreshold)
  const count = useStore((s) => s.candidates.length)

  return (
    <div className="view-toolbar" role="toolbar" aria-label="View">
      <button type="button" className="tool" onClick={onFit} title="Fit the part in view (R)">
        Fit
      </button>
      <button type="button" className="tool" aria-pressed={ui.wireframe} onClick={() => toggle('wireframe')}>
        Wire
      </button>
      <button type="button" className="tool" aria-pressed={ui.ortho} onClick={() => toggle('ortho')}>
        Ortho
      </button>
      <button type="button" className="tool" aria-pressed={ui.showCandidates} onClick={() => toggle('showCandidates')}>
        Edges
      </button>
      <label className="tool-slider" title="Edges sharper than this angle become candidate seams. Open edges always show.">
        <span>Angle</span>
        <input
          type="range"
          min={5}
          max={90}
          step={1}
          value={ui.angleThreshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
        <output>{ui.angleThreshold}°</output>
      </label>
      <span className="tool-count">
        {count.toLocaleString()} {count === 1 ? 'candidate' : 'candidates'}
      </span>
    </div>
  )
}
