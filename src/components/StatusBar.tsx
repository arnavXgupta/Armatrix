import { estimateTimeS, mmPerUnit } from '../export/toWeldJob'
import { bboxSize } from '../geometry/parseStl'
import { BIG_PART_TRIANGLES, useStore, type StoreState } from '../store/useStore'
import { formatDuration, formatLength } from '../ui/format'

const TAG = { idle: 'IDLE', loading: 'LOADING', ready: 'READY', restored: 'RESTORED', error: 'ERROR' } as const

const dim = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toPrecision(2))

function summary(s: StoreState) {
  const part = s.part!
  const known = part.units !== 'unknown'
  const deg = s.candidatesDeg
  const n = s.candidates.length
  const total = s.seams.reduce((sum, x) => sum + x.length, 0)
  const k = mmPerUnit(part.units)
  const est = estimateTimeS(s.seams.map((x) => ({ lengthMm: x.length * k, params: x.params })))
  return [
    part.name,
    `${part.triangles.toLocaleString()} tris`,
    part.triangles > BIG_PART_TRIANGLES && 'large mesh: picking may lag',
    part.dropped > 0 && `${part.dropped.toLocaleString()} degenerate dropped`,
    part.nonManifold > 0 && `${part.nonManifold.toLocaleString()} non-manifold edges`,
    `${bboxSize(part.bbox).map(dim).join(' × ')} ${known ? part.units : 'units unknown'}`,
    deg === null ? 'finding candidate seams…' : `${n.toLocaleString()} candidate ${n === 1 ? 'seam' : 'seams'} at ${deg}°`,
    deg !== null && deg !== s.ui.angleThreshold && `updating to ${s.ui.angleThreshold}°…`,
    s.seams.length > 0 && `${s.seams.length} ${s.seams.length === 1 ? 'seam' : 'seams'} · ${formatLength(total, part.units)}`,
    s.seams.length > 0 && known && `est. ${formatDuration(est)}`,
    s.status.kind === 'restored' && `restored, ${s.status.message}`,
    s.autosaveError && `autosave off: ${s.autosaveError}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function StatusBar() {
  const s = useStore()
  const manual = s.part !== null && s.mode === 'manual'
  const tag = manual ? 'MANUAL' : TAG[s.status.kind]
  const text = manual
    ? `Click points on the part · click the first point to close · Enter or double-click to finish · Esc to cancel · ${s.manualPoints.length} placed`
    : (s.status.kind === 'ready' || s.status.kind === 'restored') && s.part
      ? summary(s)
      : s.status.message

  return (
    <footer className={`status is-${s.status.kind}`}>
      <span className="status-tag">[ {tag} ]</span>
      <span className="status-text" title={text} aria-live="polite">
        {s.notice && <span className="status-notice">{s.notice} · </span>}
        {text}
      </span>
      {s.status.kind === 'loading' && <span className="status-pct">{Math.round((s.status.progress ?? 0) * 100)} %</span>}
      <button type="button" className="status-help" onClick={() => s.setHelpOpen(true)} title="Keyboard shortcuts (?)">
        ? shortcuts
      </button>
    </footer>
  )
}
