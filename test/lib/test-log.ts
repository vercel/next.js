// Creates an event log. You can write to this during testing and then assert
// on the result.
//
// The main use case is for asynchronous e2e tests. It provides a `waitFor`
// method that resolves when the log matches some expected asynchronous sequence
// of events. This is an alternative to setting up a timer loop. It helps catch
// subtle mistakes where the order of events is not expected, or the same
// event happens more than it should.
//
// Based on the Scheduler.log pattern used in the React repo.
export function createTestLog() {
  let events = []

  // Represents a pending waitFor call.
  let pendingExpectation: null | {
    resolve: () => void
    reject: (error: Error) => void
    expectedEvents: Array<any>
    error: Error
  } = null

  function log(value: any) {
    // Add to the event log.
    events.push(value)

    // Check if we've reached the end of the expected log. If there's a
    // pending waitFor, and we've reached the last of the expected events, this
    // will resolve the promise.
    pingExpectation()
  }

  function assert(expectedEvents: any[]) {
    if (pendingExpectation !== null) {
      const error = new Error('Cannot assert while a waitFor() is pending.')
      Error.captureStackTrace(error, assert)
      throw error
    }

    const actualEvents = events
    events = []

    if (!areLogsEqual(expectedEvents, actualEvents)) {
      // Capture the stack trace of `assert` so that Jest will report the
      // error as originating from the `assert` call instead of here.
      const error = new Error(
        'Expected sequence of events did not occur.\n\n' +
          createDiff(expectedEvents, actualEvents)
      )
      Error.captureStackTrace(error, assert)
      throw error
    }
  }

  function waitFor(expectedEvents: any[], timeout: number = 5000) {
    // Returns a promise that resolves when the event log matches the
    // expected sequence.

    // Capture the stack trace of `waitFor` so that if an inner assertion fails,
    // Jest will report the error as originating from the `waitFor` call instead
    // of inside this module's implementation.
    const error = new Error()
    Error.captureStackTrace(error, waitFor)

    if (pendingExpectation !== null) {
      error.message = 'A previous waitFor() is still pending.'
      throw error
    }

    let resolve
    let reject
    const promise = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })

    const thisExpectation = {
      resolve,
      reject,
      expectedEvents,
      error,
    }
    pendingExpectation = thisExpectation

    setTimeout(() => {
      if (pendingExpectation === thisExpectation) {
        error.message = `waitFor timed out after ${timeout}ms`
        reject(error)
      }
    }, timeout)

    pingExpectation()

    return promise
  }

  function pingExpectation() {
    if (pendingExpectation !== null) {
      const expectedEvents = pendingExpectation.expectedEvents
      if (events.length < expectedEvents.length) {
        return
      }

      if (areLogsEqual(expectedEvents, events)) {
        // We've reached the end of the expected log. Resolve the promise and
        // reset the log.
        events = []
        pendingExpectation.resolve()
        pendingExpectation = null
      } else {
        // The log does not match what was expected by the test. Reject the
        // promise and reset the log.

        // Use the error object that we captured at the start of the `waitFor`
        // call. Jest will show that the error originated from `waitFor` call
        // instead of inside this internal function.
        const error = pendingExpectation.error
        error.message =
          'Expected sequence of events did not occur.\n\n' +
          createDiff(expectedEvents, events)

        events = []
        pendingExpectation.reject(error)
        pendingExpectation = null
      }
    }
  }

  function createDiff(expected, actual) {
    // TODO: Jest exposes the diffing utility that it uses for `expect`.
    // We could use that here for nicer output.
    return `
Expected: ${JSON.stringify(expected)}
Actual:   ${JSON.stringify(actual)}
`
  }

  function areLogsEqual(a, b) {
    if (a.length !== b.length) {
      return false
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false
      }
    }
    return true
  }

  return {
    log,
    waitFor,
    assert,
  }
}
