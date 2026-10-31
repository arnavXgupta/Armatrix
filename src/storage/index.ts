import { createLocalStore } from './local'
import type { PlanStore } from './types'

// The one place persistence is chosen. Plan 06b (cloud save) wraps or replaces this.
export const storage: PlanStore = createLocalStore()
