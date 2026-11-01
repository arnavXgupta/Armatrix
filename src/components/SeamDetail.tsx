import { useState } from 'react'
import { defaultParams } from '../export/defaults'
import { PROCESSES, WEAVE_PATTERNS, WELD_TYPES, type WeldParams } from '../export/schema'
import { useStore } from '../store/useStore'
import { formatLength } from '../ui/format'
import { fitPoints } from '../viewport/api'

type NumberFieldProps = {
  field: string
  label: string
  unit?: string
  value: number
  min?: number
  above?: number // exclusive minimum
  max?: number
  integer?: boolean
  onCommit: (v: number) => void
}

/** Text input that commits a valid number on blur or Enter; anything else stays local with a message. */
function NumberField({ field, label, unit, value, min, above, max, integer, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const v = Number(draft.trim().replace(',', '.'))
    const problem =
      draft.trim() === '' || !Number.isFinite(v)
        ? 'Enter a number.'
        : integer && !Number.isInteger(v)
          ? 'Enter a whole number.'
          : above !== undefined && v <= above
            ? `Must be above ${above}.`
            : min !== undefined && v < min
              ? `Must be at least ${min}.`
              : max !== undefined && v > max
                ? `Must be at most ${max}.`
                : null
    setError(problem)
    if (problem) return
    setDraft(null)
    if (v !== value) onCommit(v)
  }
  return (
    <label className={error ? 'field is-invalid' : 'field'}>
      <span className="field-label">
        {label} {unit && <em>{unit}</em>}
      </span>
      <input
        id={`f-${field}`}
        type="text"
        inputMode="decimal"
        value={draft ?? String(value)}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(null)
            setError(null)
          }
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export default function SeamDetail() {
  const seam = useStore((s) => s.seams.find((x) => x.id === s.selectedSeamId))
  const units = useStore((s) => s.part?.units)
  const { updateParams, resetParams, applyParamsToType, flipSeam, removeSeam, renameSeam, setNotes } = useStore.getState()

  if (!seam) {
    return (
      <aside className="panel detail" aria-labelledby="detail-title">
        <h2 id="detail-title" className="panel-title">Seam detail</h2>
        <p className="panel-empty">Select a seam to set its weld type, process and parameters.</p>
      </aside>
    )
  }

  const p = seam.params
  const set = (patch: Partial<WeldParams>) => updateParams(seam.id, patch)
  const isDefault = JSON.stringify(p) === JSON.stringify(defaultParams(p.weldType, p.process))
  const num = (field: keyof WeldParams, label: string, unit: string, extra: Partial<NumberFieldProps> = {}) => (
    <NumberField field={field} label={label} unit={unit} value={p[field] as number} onCommit={(v) => set({ [field]: v })} {...extra} />
  )

  return (
    <aside className="panel detail" aria-labelledby="detail-title">
      <h2 id="detail-title" className="panel-title">Seam detail</h2>
      {/* key: a different seam gets fresh inputs, never another seam's half-typed draft */}
      <div className="detail-body" key={seam.id}>
        <div className="detail-head">
          <input
            key={seam.name}
            id="f-name"
            className="detail-name"
            defaultValue={seam.name}
            aria-label="Seam name"
            onBlur={(e) => renameSeam(seam.id, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <p className="detail-meta">
            {seam.source === 'auto' ? 'Detected edge' : 'Manual'} · {formatLength(seam.length, units)} · {seam.points.length} points ·{' '}
            {seam.closed ? 'closed loop' : 'open'}
          </p>
          <div className="detail-actions">
            <button type="button" className="btn-ghost btn-small" onClick={() => flipSeam(seam.id)} title="Reverse the weld direction (F)">
              Flip direction
            </button>
            <button type="button" className="btn-ghost btn-small" onClick={() => fitPoints(seam.points)} title="Frame this seam in the view">
              Fit to seam
            </button>
            <button type="button" className="btn-ghost btn-small btn-danger" onClick={() => removeSeam(seam.id)} title="Delete this seam (Del)">
              Delete
            </button>
          </div>
        </div>

        <form className="params" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Joint</legend>
            <label className="field">
              <span className="field-label">Weld type</span>
              <select id="f-weldType" value={p.weldType} onChange={(e) => set({ weldType: e.target.value as WeldParams['weldType'] })}>
                {WELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Process</span>
              <select id="f-process" value={p.process} onChange={(e) => set({ process: e.target.value as WeldParams['process'] })}>
                {PROCESSES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <p className="joint-links field-wide">
              <button type="button" className="link-btn apply-btn" onClick={() => applyParamsToType(seam.id)} title={`Copy these parameters to every other ${p.weldType} seam`}>
                Apply to all {p.weldType} seams
              </button>
              {!isDefault && (
                <button type="button" className="link-btn reset-btn" onClick={() => resetParams(seam.id)}>
                  Reset to {p.weldType} · {p.process} defaults
                </button>
              )}
            </p>
          </fieldset>

          <fieldset>
            <legend>Motion</legend>
            {num('travelSpeedMmS', 'Travel speed', 'mm/s', { above: 0 })}
            {num('workAngleDeg', 'Work angle', '°', { min: 0, max: 90 })}
            {num('travelAngleDeg', 'Travel angle', '°', { min: -60, max: 60 })}
            <label className="field">
              <span className="field-label">Weave</span>
              <select
                id="f-weave"
                value={p.weave.pattern}
                onChange={(e) => {
                  const pattern = e.target.value as WeldParams['weave']['pattern']
                  set({ weave: pattern === 'none' ? { pattern } : { pattern, amplitudeMm: p.weave.amplitudeMm ?? 2, frequencyHz: p.weave.frequencyHz ?? 1 } })
                }}
              >
                {WEAVE_PATTERNS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {p.weave.pattern !== 'none' && (
              <>
                <NumberField field="amplitudeMm" label="Weave amplitude" unit="mm" value={p.weave.amplitudeMm ?? 2} above={0} onCommit={(v) => set({ weave: { ...p.weave, amplitudeMm: v } })} />
                <NumberField field="frequencyHz" label="Weave rate" unit="Hz" value={p.weave.frequencyHz ?? 1} above={0} onCommit={(v) => set({ weave: { ...p.weave, frequencyHz: v } })} />
              </>
            )}
            {num('approachMm', 'Approach', 'mm', { min: 0 })}
            {num('retractMm', 'Retract', 'mm', { min: 0 })}
          </fieldset>

          <fieldset>
            <legend>Arc</legend>
            {num('wireFeedMMin', 'Wire feed', 'm/min', { min: 0 })}
            {num('voltageV', 'Voltage', 'V', { above: 0 })}
            {num('currentA', 'Current', 'A', { above: 0 })}
            {num('passes', 'Passes', '', { min: 1, integer: true })}
            <label className="check field-wide">
              <input id="f-tackFirst" type="checkbox" checked={p.tackFirst} onChange={(e) => set({ tackFirst: e.target.checked })} />
              Tack before the full pass
            </label>
          </fieldset>

          <label className="field field-wide">
            <span className="field-label">Notes</span>
            <textarea key={seam.notes ?? ''} rows={2} defaultValue={seam.notes ?? ''} onBlur={(e) => setNotes(seam.id, e.target.value)} placeholder="For the operator" />
          </label>

        </form>
      </div>
    </aside>
  )
}
