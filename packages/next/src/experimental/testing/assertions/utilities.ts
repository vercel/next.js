import { TestFakeTimers } from './fake-timers'
import { createTimerWaits } from './wait'
import { createEnvironmentStubs } from './assertion-platform'
import type { FakeTimerConfig } from '../../../compiled/next-test-primitives/timers'

export type FakeTimerOptions = FakeTimerConfig

export interface EnvironmentStubs {
  stub(name: string, value: string | boolean | undefined): void
  restore(): void
}

/** Runtime-mutable fields of the pinned public configuration contract. */
export interface RuntimeOptions {
  allowOnly?: boolean
  testTimeout?: number
  hookTimeout?: number
  clearMocks?: boolean
  mockReset?: boolean
  restoreMocks?: boolean
  fakeTimers?: FakeTimerOptions
  maxConcurrency?: number
  expect?: {
    poll?: { interval?: number; timeout?: number }
    requireAssertions?: boolean
  }
  printConsoleTrace?: boolean
  sequence?: { hooks?: 'stack' | 'list' | 'parallel' }
}

/** Named return contract keeps fluent self references precise in declarations. */
export interface AttemptUtilities
  extends Pick<ReturnType<typeof createTimerWaits>, 'waitFor' | 'waitUntil'> {
  dynamicImportSettled(): Promise<void>
  setConfig(config: RuntimeOptions): void
  resetConfig(): void
  stubGlobal(name: string | symbol | number, value: unknown): AttemptUtilities
  stubEnv<T extends string>(
    name: T,
    value: T extends 'DEV' | 'PROD' | 'SSR'
      ? boolean | undefined
      : string | undefined
  ): AttemptUtilities
  unstubAllGlobals(): AttemptUtilities
  unstubAllEnvs(): AttemptUtilities
  useFakeTimers(options?: FakeTimerOptions): AttemptUtilities
  useRealTimers(): AttemptUtilities
  isFakeTimers(): boolean
  clearAllTimers(): AttemptUtilities
  getTimerCount(): number
  getMockedSystemTime(): Date | null
  getRealSystemTime(): number
  setSystemTime(value?: number | string | Date): AttemptUtilities
  advanceTimersByTime(ms: number): AttemptUtilities
  advanceTimersByTimeAsync(ms: number): Promise<AttemptUtilities>
  advanceTimersToNextTimer(): AttemptUtilities
  advanceTimersToNextTimerAsync(): Promise<AttemptUtilities>
  advanceTimersToNextFrame(): AttemptUtilities
  runAllTicks(): AttemptUtilities
  setTimerTickMode(
    mode: 'manual' | 'nextTimerAsync' | 'interval',
    interval?: number
  ): AttemptUtilities
  runOnlyPendingTimers(): AttemptUtilities
  runOnlyPendingTimersAsync(): Promise<AttemptUtilities>
  runAllTimers(): AttemptUtilities
  runAllTimersAsync(): Promise<AttemptUtilities>
  dispose(): void
}

/** Attempt-owned utilities. Framework deadlines use separately captured timers. */
export function createAttemptUtilities(
  assertActive: () => void,
  fakeTimerConfig?: FakeTimerOptions,
  runtimeConfig?: RuntimeOptions,
  waitForImports?: () => Promise<void>,
  onClock?: (clock: TestFakeTimers) => void
): AttemptUtilities {
  const globalDescriptors = new Map<
    PropertyKey,
    PropertyDescriptor | undefined
  >()
  const environmentStubs = createEnvironmentStubs()
  const envValues = new Map<string, string | undefined>()
  const defaults: FakeTimerOptions = {
    loopLimit: 10000,
    shouldClearNativeTimers: true,
    ...fakeTimerConfig,
  }
  let originalConfig: RuntimeOptions | undefined
  const mutableConfig = runtimeConfig ?? { fakeTimers: defaults }
  let clock: TestFakeTimers | undefined
  const getClock = () => {
    if (!clock) {
      clock = new TestFakeTimers({ global: globalThis, config: defaults })
      onClock?.(clock)
    }
    return clock
  }

  function rememberGlobal(name: PropertyKey) {
    if (!globalDescriptors.has(name)) {
      globalDescriptors.set(
        name,
        Object.getOwnPropertyDescriptor(globalThis, name)
      )
    }
  }

  function stubGlobal(name: string | symbol | number, value: unknown) {
    assertActive()
    rememberGlobal(name)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    })
    return api
  }

  function stubEnv(name: string, value: string | boolean | undefined) {
    assertActive()
    if (environmentStubs) {
      environmentStubs.stub(name, value)
      return api
    }
    if (!envValues.has(name)) envValues.set(name, process.env[name])
    if (value === undefined) delete process.env[name]
    else process.env[name] = String(value)
    return api
  }

  function restoreGlobals() {
    for (const [name, descriptor] of globalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    globalDescriptors.clear()
  }

  function restoreEnvs() {
    if (environmentStubs) {
      environmentStubs.restore()
      return
    }
    for (const [name, value] of envValues) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    envValues.clear()
  }

  const waits = createTimerWaits(
    {
      isFakeTimers: () => getClock().isFakeTimers(),
      advanceTimersByTime: (ms) => getClock().advanceTimersByTime(ms),
    },
    assertActive
  )

  const api: AttemptUtilities = {
    async dynamicImportSettled(): Promise<void> {
      assertActive()
      if (!waitForImports)
        throw new Error('Import settling requires the compiled test runtime')
      await waitForImports()
      assertActive()
    },
    setConfig(config: RuntimeOptions): void {
      assertActive()
      originalConfig ??= { ...mutableConfig }
      Object.assign(mutableConfig, config)
    },
    resetConfig(): void {
      assertActive()
      if (originalConfig) Object.assign(mutableConfig, originalConfig)
    },
    waitFor: waits.waitFor,
    waitUntil: waits.waitUntil,
    stubGlobal,
    stubEnv,
    unstubAllGlobals() {
      assertActive()
      restoreGlobals()
      return api
    },
    unstubAllEnvs() {
      assertActive()
      restoreEnvs()
      return api
    },
    useFakeTimers(options?: FakeTimerOptions) {
      assertActive()
      getClock().configure({
        ...(mutableConfig.fakeTimers ?? defaults),
        ...options,
      })
      getClock().useFakeTimers()
      return api
    },
    useRealTimers() {
      assertActive()
      getClock().useRealTimers()
      return api
    },
    isFakeTimers() {
      assertActive()
      return getClock().isFakeTimers()
    },
    clearAllTimers() {
      assertActive()
      getClock().clearAllTimers()
      return api
    },
    getTimerCount() {
      assertActive()
      return getClock().getTimerCount()
    },
    getMockedSystemTime() {
      assertActive()
      return getClock().getMockedSystemTime()
    },
    getRealSystemTime() {
      assertActive()
      return getClock().getRealSystemTime()
    },
    setSystemTime(value?: number | string | Date) {
      assertActive()
      getClock().setSystemTime(value)
      return api
    },
    advanceTimersByTime(ms: number) {
      assertActive()
      getClock().advanceTimersByTime(ms)
      return api
    },
    async advanceTimersByTimeAsync(ms: number) {
      assertActive()
      await getClock().advanceTimersByTimeAsync(ms)
      return api
    },
    advanceTimersToNextTimer() {
      assertActive()
      getClock().advanceTimersToNextTimer()
      return api
    },
    async advanceTimersToNextTimerAsync() {
      assertActive()
      await getClock().advanceTimersToNextTimerAsync()
      return api
    },
    advanceTimersToNextFrame() {
      assertActive()
      getClock().advanceTimersToNextFrame()
      return api
    },
    runAllTicks() {
      assertActive()
      getClock().runAllTicks()
      return api
    },
    setTimerTickMode(
      mode: 'manual' | 'nextTimerAsync' | 'interval',
      interval?: number
    ) {
      assertActive()
      getClock().setTimerTickMode(mode, interval)
      return api
    },
    runOnlyPendingTimers() {
      assertActive()
      getClock().runOnlyPendingTimers()
      return api
    },
    async runOnlyPendingTimersAsync() {
      assertActive()
      await getClock().runOnlyPendingTimersAsync()
      return api
    },
    runAllTimers() {
      assertActive()
      getClock().runAllTimers()
      return api
    },
    async runAllTimersAsync() {
      assertActive()
      await getClock().runAllTimersAsync()
      return api
    },
    dispose() {
      waits.dispose()
      clock?.dispose()
      restoreGlobals()
      restoreEnvs()
    },
  }
  return api
}
