import type { Vec3 } from '../geometry/types'
import type { Scene } from './Scene'

// The mounted viewport, for panels outside it that need the camera (e.g. "Fit to seam").
let scene: Scene | null = null
export const setActiveScene = (s: Scene | null) => {
  scene = s
}
export const fitPoints = (points: Vec3[]) => scene?.fitPoints(points)
