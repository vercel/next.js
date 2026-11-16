/**
 * @jest-environment node
 */

import { isPrerenderInterruptedError } from './dynamic-rendering'
import { abortAndThrowOnSynchronousRequestDataAccess } from './dynamic-rendering'

function makePrerenderStore() {
  const controller = new AbortController()
  return {
    type: 'prerender',
    controller,
    dynamicTracking: {
      isDebugDynamicAccesses: false,
      dynamicAccesses: [],
      syncDynamicErrorWithStack: null,
      syncDynamicErrorWithStackPostMicrotask: false,
    },
    runtimeDataAccessed: { resolve() {} },
    shouldAttemptStaticPrefetch: null,
  } as any
}

describe('prerender interrupt abort reason', () => {
  it('reuses one Error constructed at module load, not on the render stack', () => {
    function render() {
      try {
        abortAndThrowOnSynchronousRequestDataAccess(
          '/',
          'Date.now()',
          new Error('sync'),
          makePrerenderStore()
        )
      } catch (err) {
        return err as Error
      }
    }

    const first = render()
    const second = render()

    expect(first).toBe(second)
    expect(isPrerenderInterruptedError(first)).toBe(true)
    expect(first.stack).not.toMatch(/at render /)
  })
})
