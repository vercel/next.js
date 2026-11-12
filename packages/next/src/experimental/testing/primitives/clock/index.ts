import { createTimerContext as createClockContext } from './runtime'
import type { TimerContext } from './types'

export type {
  FakeTimerConfig,
  FakeTimerMethod,
  TimerClock,
  TimerContext,
} from './types'

/** Create a clock context for a browser, worker, or other portable realm. */
export function createTimerContext(global: typeof globalThis): TimerContext {
  return createClockContext(global)
}
