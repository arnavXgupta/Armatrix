import type { Vec3 } from '../geometry/types'
import { flipSeam, type Seam } from './seams'

/** Straight torch move with the arc off, from one seam's end to the next seam's start. Part units. */
export type AirMove = { from: Vec3; to: Vec3; length: number }

const dist = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

export const entry = (s: Seam): Vec3 => s.points[0]
/** A loop ends where it started. */
export const exit = (s: Seam): Vec3 => (s.closed ? s.points[0] : s.points[s.points.length - 1])

export function airMoves(seams: Seam[]): AirMove[] {
  const moves: AirMove[] = []
  for (let i = 1; i < seams.length; i++) {
    const from = exit(seams[i - 1]), to = entry(seams[i])
    moves.push({ from, to, length: dist(from, to) })
  }
  return moves
}

export const airTravel = (seams: Seam[]) => airMoves(seams).reduce((sum, m) => sum + m.length, 0)

/**
 * Greedy nearest neighbour: the first seam stays first, then each next seam is the one whose
 * nearer end is closest to where the torch is. An open seam whose far end is nearer is flipped.
 * Loops are never flipped and keep their start point.
 * ponytail: O(n²) greedy, no optimality guarantee. A 2-opt pass is the upgrade; entering a loop at
 * its nearest waypoint (rotating it) is the other.
 */
export function orderByNearest(seams: Seam[]): Seam[] {
  if (seams.length < 2) return seams
  const rest = seams.slice(1)
  const out = [seams[0]]
  while (rest.length) {
    const at = exit(out[out.length - 1])
    let best = 0, bestD = Infinity, flip = false
    rest.forEach((s, i) => {
      const dIn = dist(at, entry(s))
      if (dIn < bestD) [best, bestD, flip] = [i, dIn, false]
      const dOut = s.closed ? Infinity : dist(at, s.points[s.points.length - 1])
      if (dOut < bestD) [best, bestD, flip] = [i, dOut, true]
    })
    const [s] = rest.splice(best, 1)
    out.push(flip ? flipSeam(s) : s)
  }
  return out
}
