import type { TestFakeTimers as NodeTestFakeTimers } from '../assertions/fake-timers'

function unsupported(): never {
  throw new Error(
    'Browser Mode fake timers are not qualified for this client profile.'
  )
}
/** No Node timer bridge or global process object enters the client graph. */
export class TestFakeTimers
  implements Pick<NodeTestFakeTimers, keyof NodeTestFakeTimers>
{
  constructor(options: ConstructorParameters<typeof NodeTestFakeTimers>[0]) {
    if (options.global !== globalThis)
      throw new Error(
        'Browser Mode timer scope must use its owned page global.'
      )
  }
  dispose(): void {}
  useRealTimers(): void {}
  isFakeTimers(): boolean {
    return false
  }
  getMockedSystemTime(): Date | null {
    return null
  }
  getRealSystemTime(): number {
    return Date.now()
  }
  clearAllTimers(
    ..._args: Parameters<NodeTestFakeTimers['clearAllTimers']>
  ): never {
    return unsupported()
  }
  runAllTimers(
    ..._args: Parameters<NodeTestFakeTimers['runAllTimers']>
  ): never {
    return unsupported()
  }
  runAllTimersAsync(
    ..._args: Parameters<NodeTestFakeTimers['runAllTimersAsync']>
  ): never {
    return unsupported()
  }
  runOnlyPendingTimers(
    ..._args: Parameters<NodeTestFakeTimers['runOnlyPendingTimers']>
  ): never {
    return unsupported()
  }
  runOnlyPendingTimersAsync(
    ..._args: Parameters<NodeTestFakeTimers['runOnlyPendingTimersAsync']>
  ): never {
    return unsupported()
  }
  advanceTimersToNextTimer(
    ..._args: Parameters<NodeTestFakeTimers['advanceTimersToNextTimer']>
  ): never {
    return unsupported()
  }
  advanceTimersToNextTimerAsync(
    ..._args: Parameters<NodeTestFakeTimers['advanceTimersToNextTimerAsync']>
  ): never {
    return unsupported()
  }
  advanceTimersByTime(
    ..._args: Parameters<NodeTestFakeTimers['advanceTimersByTime']>
  ): never {
    return unsupported()
  }
  advanceTimersByTimeAsync(
    ..._args: Parameters<NodeTestFakeTimers['advanceTimersByTimeAsync']>
  ): never {
    return unsupported()
  }
  advanceTimersToNextFrame(
    ..._args: Parameters<NodeTestFakeTimers['advanceTimersToNextFrame']>
  ): never {
    return unsupported()
  }
  runAllTicks(..._args: Parameters<NodeTestFakeTimers['runAllTicks']>): never {
    return unsupported()
  }
  useFakeTimers(
    ..._args: Parameters<NodeTestFakeTimers['useFakeTimers']>
  ): never {
    return unsupported()
  }
  reset(..._args: Parameters<NodeTestFakeTimers['reset']>): never {
    return unsupported()
  }
  setSystemTime(
    ..._args: Parameters<NodeTestFakeTimers['setSystemTime']>
  ): never {
    return unsupported()
  }
  getTimerCount(
    ..._args: Parameters<NodeTestFakeTimers['getTimerCount']>
  ): never {
    return unsupported()
  }
  setTimerTickMode(
    ..._args: Parameters<NodeTestFakeTimers['setTimerTickMode']>
  ): never {
    return unsupported()
  }
  configure(..._args: Parameters<NodeTestFakeTimers['configure']>): never {
    return unsupported()
  }
}
