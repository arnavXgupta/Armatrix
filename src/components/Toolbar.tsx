import { useStore } from '../store/useStore'

export default function Toolbar() {
  const part = useStore((s) => s.part)
  const setUnits = useStore((s) => s.setUnits)
  const clearPart = useStore((s) => s.clearPart)

  return (
    <header className="toolbar">
      <img className="toolbar-logo" src="/brand/logo-horizontal-sand.svg" alt="Armatrix" />
      <h1 className="toolbar-title">Weld Seam Planner</h1>
      <div className="toolbar-part">
        {part ? (
          <>
            <span className="part-name" title={part.name}>
              {part.name}
            </span>
            <span className="part-meta">{part.triangles.toLocaleString()} tris</span>
            <select
              className={['unit-select', part.unitsGuessed && 'is-guessed', part.units === 'unknown' && 'is-unknown'].filter(Boolean).join(' ')}
              value={part.units === 'unknown' ? '' : part.units}
              onChange={(e) => setUnits(e.target.value as 'mm' | 'in')}
              aria-label="Part units"
              title={part.unitsGuessed ? 'Guessed from the part size. Pick to confirm.' : 'Part units'}
            >
              {part.units === 'unknown' && (
                <option value="" disabled>
                  units?
                </option>
              )}
              <option value="mm">mm</option>
              <option value="in">in</option>
            </select>
          </>
        ) : (
          <span className="part-meta">No part loaded</span>
        )}
      </div>
      {part && (
        <button type="button" className="btn-ghost" onClick={clearPart}>
          New part
        </button>
      )}
      <button type="button" className="btn-primary" disabled title="Pick seams first (next build)">
        Export <span aria-hidden="true">→</span>
      </button>
    </header>
  )
}
