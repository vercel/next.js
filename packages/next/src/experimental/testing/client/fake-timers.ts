import { createTimerContext } from '../../../compiled/next-test-primitives/browser'
import { TestFakeTimersCore } from '../assertions/fake-timers-core'

/** The page clock shares the genuine algorithm without a Node timer bridge. */
export class TestFakeTimers extends TestFakeTimersCore {
  constructor(options: ConstructorParameters<typeof TestFakeTimersCore>[0]) {
    if (options.global !== globalThis)
      throw new Error(
        'Browser Mode timer scope must use its owned page global.'
      )
    super(options, {
      createTimerContext,
      isChildProcess: () => false,
    })
  }
}
