import type { NodeTimerBridge, TimerContext } from './types'

export function createTimerContext(
  global: typeof globalThis,
  bridge?: NodeTimerBridge
): TimerContext
