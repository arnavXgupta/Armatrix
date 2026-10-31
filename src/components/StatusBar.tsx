import { bboxSize } from '../geometry/parseStl'
import { useStore, type Part } from '../store/useStore'

const TAG = { idle: 'IDLE', loading: 'LOADING', ready: 'READY', error: 'ERROR' } as const

const dim = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toPrecision(2))

function summary(part: Part, candidates: number, deg: number | null, target: number) {
  const units = part.units === 'unknown' ? 'units unknown' : part.units
  return [
    part.name,
    `${part.triangles.toLocaleString()} tris`,
    part.dropped > 0 && `${part.dropped.toLocaleString()} degenerate dropped`,
    part.nonManifold > 0 && `${part.nonManifold.toLocaleString()} non-manifold edges`,
    `${bboxSize(part.bbox).map(dim).join(' × ')} ${units}`,
    deg === null
      ? 'finding candidate seams…'
      : `${candidates.toLocaleString()} candidate ${candidates === 1 ? 'seam' : 'seams'} at ${deg}°`,
    deg !== null && deg !== target && `updating to ${target}°…`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function StatusBar() {
  const status = useStore((s) => s.status)
  const part = useStore((s) => s.part)
  const candidates = useStore((s) => s.candidates.length)
  // the angle these candidates were computed at, not the slider's: the pair is always true
  const deg = useStore((s) => s.candidatesDeg)
  const target = useStore((s) => s.ui.angleThreshold)
  const text = status.kind === 'ready' && part ? summary(part, candidates, deg, target) : status.message

  return (
    <footer className={`status is-${status.kind}`} role="status">
      <span className="status-tag">[ {TAG[status.kind]} ]</span>
      <span className="status-text" title={text}>
        {text}
      </span>
      {status.kind === 'loading' && <span className="status-pct">{Math.round((status.progress ?? 0) * 100)} %</span>}
    </footer>
  )
}
