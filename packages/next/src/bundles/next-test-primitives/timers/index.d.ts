import type {
  Config,
  Clock,
  FakeTimers,
  FakeMethod,
} from '@sinonjs/fake-timers'
export type FakeTimerMethod = FakeMethod | 'Temporal'
export interface FakeTimerConfig extends Omit<Config, 'toFake'> {
  toFake?: FakeTimerMethod[]
  toNotFake?: FakeTimerMethod[]
  shouldClearNativeTimers?: boolean
  ignoreMissingTimers?: boolean
}
export interface TimerClock extends Clock {
  setTickMode(mode: {
    mode: 'manual' | 'nextAsync' | 'interval'
    delta?: number
  }): void
}
export interface TimerContext extends Omit<FakeTimers, 'install' | 'timers'> {
  timers: Record<string, unknown>
  install(config?: FakeTimerConfig): TimerClock
}
export function createTimerContext(
  global: typeof globalThis,
  bridge: { timers: unknown; timersPromises: unknown; util: unknown }
): TimerContext
