import type { Units } from '../geometry/parseStl'

/** A length in the part's units, with a sensible number of decimals. */
export function formatLength(v: number, units: Units | undefined): string {
  const n = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v === 0 ? '0' : v.toPrecision(2)
  return units && units !== 'unknown' ? `${n} ${units}` : n
}

/** 252 → "4 min 12 s"; 3725 → "1 h 2 min". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min ${s % 60} s`
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
}
