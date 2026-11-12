import { createTimerContext as createClockContext } from './runtime'
import type { NodeTimerBridge, TimerContext } from './types'

export type {
  FakeTimerConfig,
  FakeTimerMethod,
  NodeTimerBridge,
  TimerClock,
  TimerContext,
} from './types'

/** Create a Node clock context with timer modules supplied by its host. */
export function createTimerContext(
  global: typeof globalThis,
  bridge: NodeTimerBridge
): TimerContext {
  return createClockContext(global, bridge)
}
