import type { Process, WeldParams, WeldType } from './schema'

// Starting points for an engineer to adjust, not qualified welding procedures (WPS).
const GMAW: Record<WeldType, { speed: number; wire: number; v: number; a: number; work: number; travel: number }> = {
  fillet: { speed: 6, wire: 7.5, v: 22, a: 180, work: 45, travel: 10 },
  butt: { speed: 5, wire: 6.5, v: 21, a: 160, work: 90, travel: 10 },
  lap: { speed: 6, wire: 7.0, v: 21, a: 170, work: 60, travel: 10 },
  groove: { speed: 4, wire: 7.0, v: 23, a: 190, work: 90, travel: 5 },
}

const round1 = (v: number) => Math.round(v * 10) / 10

export function defaultParams(weldType: WeldType = 'fillet', process: Process = 'GMAW'): WeldParams {
  const g = GMAW[weldType]
  let { speed, wire, v, a } = g
  if (process === 'GTAW') {
    speed *= 0.7
    wire = 0
    v = 12
    a *= 0.8
  } else if (process === 'FCAW') {
    wire += 1.5
    v += 2
    a += 20
  }
  return {
    weldType,
    process,
    travelSpeedMmS: round1(speed),
    wireFeedMMin: round1(wire),
    voltageV: round1(v),
    currentA: Math.round(a),
    passes: 1,
    weave: { pattern: 'none' },
    workAngleDeg: g.work,
    travelAngleDeg: g.travel,
    approachMm: 10,
    retractMm: 10,
    tackFirst: false,
  }
}

/** Arc start/stop allowance per seam in the time estimate, seconds. */
export const SEAM_OVERHEAD_S = 4

/** Torch speed for the moves between seams (arc off) in the time estimate, mm/s. */
export const AIR_SPEED_MM_S = 100
