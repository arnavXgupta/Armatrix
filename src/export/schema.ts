// Weld job export format, v1. Every field has a one-line JSDoc; README's schema table is generated
// from them by `npm run docs:schema` (scripts/schema-table.mjs) and a test fails if it drifts.
import type { Vec3 } from '../geometry/types'

export const SCHEMA_VERSION = '1.0'

export type WeldType = 'fillet' | 'butt' | 'lap' | 'groove'
export type Process = 'GMAW' | 'GTAW' | 'FCAW'
export type WeavePattern = 'none' | 'zigzag' | 'circular'

export type SourceUnits = 'mm' | 'in' | 'm'
/** Multiply a source-unit length by this to get mm. */
export const UNIT_SCALE: Record<SourceUnits, number> = { mm: 1, in: 25.4, m: 1000 }

export const WELD_TYPES: WeldType[] = ['fillet', 'butt', 'lap', 'groove']
export const PROCESSES: Process[] = ['GMAW', 'GTAW', 'FCAW']
export const WEAVE_PATTERNS: WeavePattern[] = ['none', 'zigzag', 'circular']

/** Process settings for one seam. Starting points, not a qualified welding procedure. */
export type WeldParams = {
  /** Joint geometry the seam belongs to. */
  weldType: WeldType
  /** Arc process: GMAW (MIG/MAG), GTAW (TIG) or FCAW (flux-cored). */
  process: Process
  /** Torch speed along the seam, mm/s. */
  travelSpeedMmS: number
  /** Wire feed speed, m/min; 0 for autogenous GTAW. */
  wireFeedMMin: number
  /** Arc voltage, V. */
  voltageV: number
  /** Welding current, A. */
  currentA: number
  /** Number of passes; each pass repeats the path. At least 1. */
  passes: number
  /** Torch oscillation across the seam. */
  weave: {
    /** Oscillation shape; none = straight travel. */
    pattern: WeavePattern
    /** Half-width of the oscillation, mm. Present when pattern is not none. */
    amplitudeMm?: number
    /** Oscillations per second, Hz. Present when pattern is not none. */
    frequencyHz?: number
  }
  /** Torch tilt across the seam, degrees from the surface (45 for a fillet). */
  workAngleDeg: number
  /** Torch tilt along travel, degrees; positive = push, negative = drag. */
  travelAngleDeg: number
  /** Distance before the first waypoint where the torch starts its approach, mm. */
  approachMm: number
  /** Distance past the last waypoint before the torch retracts, mm. */
  retractMm: number
  /** Tack the seam at intervals before the full pass. */
  tackFirst: boolean
}

/** One waypoint of a seam path. */
export type Waypoint = {
  /** Position in mm, part coordinates. */
  p: Vec3
  /** Unit torch-approach direction, pointing away from the part: the face normal, or at an edge the bisector of the two surfaces that meet there. */
  n: Vec3
}

/** One seam, in weld order. */
export type ExportedSeam = {
  /** Stable seam id (uuid). */
  id: string
  /** 1-based position in the weld sequence. */
  order: number
  /** User label, e.g. S-01. */
  name: string
  /** auto = picked from a detected edge; manual = clicked point by point. */
  source: 'auto' | 'manual'
  /** True when the path is a loop: the robot returns to the first waypoint. */
  closed: boolean
  /** Path length in mm, including the closing segment of a loop. */
  lengthMm: number
  /** Process settings for this seam. */
  parameters: WeldParams
  /** Waypoints in weld direction. */
  path: Waypoint[]
  /** Free text for the operator. */
  notes?: string
}

/** The whole job: what a robot controller loads. */
export type WeldJob = {
  /** Format version; readers accept any 1.x. */
  schemaVersion: typeof SCHEMA_VERSION
  /** Job id (uuid), stable across re-exports of the same plan. */
  jobId: string
  /** Job label; defaults to the part file name without extension. */
  name: string
  /** Export time, ISO-8601 UTC. */
  createdAt: string
  /** Tool and version that wrote the file. */
  generator: string
  /** Who prepared the job. */
  operator?: string
  /** Job-level notes. */
  notes?: string
  /** Length unit of every coordinate and length in the file. Always mm. */
  units: 'mm'
  /** Coordinates are the STL's own frame, Z up as in the file, not re-centred. */
  coordinateFrame: 'part'
  /** The part the job was planned on. */
  part: {
    /** Uploaded file name. */
    fileName: string
    /** SHA-256 of the uploaded bytes; import refuses a different part unless forced. */
    sha256: string
    /** Triangle count after dropping degenerate triangles. */
    triangles: number
    /** Axis-aligned bounds in mm. */
    boundingBox: { min: Vec3; max: Vec3 }
    /** Unit the STL was drawn in, as confirmed by the user; in is scaled by 25.4, m by 1000. */
    sourceUnits: SourceUnits
  }
  /** Seams in weld order. */
  seams: ExportedSeam[]
  /** Totals computed at export. */
  summary: {
    /** Number of seams. */
    seamCount: number
    /** Sum of seam lengths, mm. */
    totalLengthMm: number
    /** Arc time (length / speed × passes) plus a fixed start/stop allowance per seam, s. */
    estimatedTimeS: number
  }
}
