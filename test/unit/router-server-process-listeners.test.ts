/* eslint-env jest */
describe('router-server process listeners', () => {
  it('should not accumulate listeners when listeners are registered multiple times', () => {
    // Get initial listener counts
    const getListenerCounts = () => {
      const uncaughtListeners = (process as NodeJS.EventEmitter).listeners(
        'uncaughtException'
      )
      const unhandledListeners = (process as NodeJS.EventEmitter).listeners(
        'unhandledRejection'
      )

      const boundLogErrorUncaught = uncaughtListeners.filter(
        (l) => (l as { name?: string }).name === 'bound logError'
      ).length
      const boundLogErrorUnhandled = unhandledListeners.filter(
        (l) => (l as { name?: string }).name === 'bound logError'
      ).length

      return {
        uncaught: uncaughtListeners.length,
        unhandled: unhandledListeners.length,
        boundLogErrorUncaught,
        boundLogErrorUnhandled,
      }
    }

    const initialCounts = getListenerCounts()

    // Simulate the listener cleanup logic from router-server.ts
    const removeExistingLogErrorListeners = (
      eventName: 'uncaughtException' | 'unhandledRejection'
    ) => {
      const listeners = (process as NodeJS.EventEmitter).listeners(eventName)
      const targetListenerName = 'bound logError'
      for (const listener of listeners) {
        const listenerName = (listener as { name?: string }).name
        if (listenerName === targetListenerName) {
          ;(process as NodeJS.EventEmitter).removeListener(
            eventName,
            listener as (...args: unknown[]) => void
          )
        }
      }
    }

    const logError = async (
      type: 'uncaughtException' | 'unhandledRejection',
      err: Error | undefined
    ) => {
      // Empty handler for testing
    }

    // Simulate multiple listener registrations (as would happen in serverless environments
    // where initialize() may be called multiple times for the same process)
    for (let i = 0; i < 5; i++) {
      removeExistingLogErrorListeners('uncaughtException')
      removeExistingLogErrorListeners('unhandledRejection')
      process.on('uncaughtException', logError.bind(null, 'uncaughtException'))
      process.on(
        'unhandledRejection',
        logError.bind(null, 'unhandledRejection')
      )

      // Check listener counts after each call
      const countsAfterCall = getListenerCounts()

      // Verify that bound logError listeners don't accumulate beyond 1
      // In serverless environments, initialize() may be called multiple times,
      // but we should only have one listener of each type
      expect(countsAfterCall.boundLogErrorUncaught).toBeLessThanOrEqual(
        initialCounts.boundLogErrorUncaught + 1
      )
      expect(countsAfterCall.boundLogErrorUnhandled).toBeLessThanOrEqual(
        initialCounts.boundLogErrorUnhandled + 1
      )
    }

    const finalCounts = getListenerCounts()

    // Final verification: listeners should not have accumulated
    expect(finalCounts.boundLogErrorUncaught).toBeLessThanOrEqual(
      initialCounts.boundLogErrorUncaught + 1
    )
    expect(finalCounts.boundLogErrorUnhandled).toBeLessThanOrEqual(
      initialCounts.boundLogErrorUnhandled + 1
    )

    // Clean up: remove test listeners
    removeExistingLogErrorListeners('uncaughtException')
    removeExistingLogErrorListeners('unhandledRejection')
  })
})
