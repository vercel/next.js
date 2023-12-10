import { createNext } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import http from 'http'

describe('ppr-navigations', () => {
  if ((global as any).isNextDev) {
    test('prefetching is disabled in dev', () => {})
    return
  }

  let server
  let next
  afterEach(async () => {
    await next?.destroy()
    server?.close()
  })

  test('when PPR is enabled, loading.tsx boundaries do not cause a partial prefetch', async () => {
    const TestLog = createTestLog()
    let pendingRequests = new Map()
    server = createTestDataServer(async (key, res) => {
      TestLog.log('REQUEST: ' + key)
      if (pendingRequests.has(key)) {
        throw new Error('Request already pending for ' + key)
      }
      pendingRequests.set(key, res)
    })
    const port = await findPort()
    server.listen(port)
    next = await createNext({
      files: __dirname,
      env: { TEST_DATA_SERVICE_URL: `http://localhost:${port}` },
    })

    // There should have been no data requests during build
    TestLog.assert([])

    const browser = await next.browser(
      '/loading-tsx-no-partial-rendering/start'
    )

    // Use a text input to set the target URL.
    const input = await browser.elementByCss('input')
    await input.fill('/loading-tsx-no-partial-rendering/yay')

    // This causes a <Link> to appear. (We create the Link after initial render
    // so we can control when the prefetch happens.)
    const link = await browser.elementByCss('a')
    expect(await link.getAttribute('href')).toBe(
      '/loading-tsx-no-partial-rendering/yay'
    )

    // The <Link> triggers a prefetch. Even though this route has a loading.tsx
    // boundary, we're still able to prefetch the static data in the page.
    // Without PPR, we would have stopped prefetching at the loading.tsx
    // boundary. (The dynamic data is not fetched until navigation.)
    await TestLog.waitFor(['REQUEST: yay [static]'])

    // Navigate. This will trigger the dynamic fetch.
    await link.click()

    // TODO: Even though the prefetch request hasn't resolved yet, we should
    // have already started fetching the dynamic data. Currently, the dynamic
    // is fetched lazily during rendering, creating a waterfall. The plan is to
    // remove this waterfall by initiating the fetch directly inside the
    // router navigation handler, not during render.
    TestLog.assert([])

    // Finish loading the static data
    pendingRequests.get('yay [static]').resolve()

    // The static UI appears
    await browser.elementById('static')
    const container = await browser.elementById('container')
    expect(await container.innerHTML()).toEqual(
      'Loading dynamic...<div id="static">yay [static]</div>'
    )

    // The dynamic data is fetched
    TestLog.assert(['REQUEST: yay [dynamic]'])

    // Finish loading and render the full UI
    pendingRequests.get('yay [dynamic]').resolve()
    await browser.elementById('dynamic')
    expect(await container.innerHTML()).toEqual(
      '<div id="dynamic">yay [dynamic]</div><div id="static">yay [static]</div>'
    )

    // Now we'll demonstrate that even though loading.tsx wasn't activated
    // during initial render, it still acts as a regular Suspense boundary.
    // Trigger a "bad" Suspense fallback by intentionally suspending without
    // startTransition.
    await browser.elementById('trigger-bad-suspense-fallback').click()
    const loading = await browser.elementById('loading-tsx')
    expect(await loading.innerHTML()).toEqual('Loading [inner loading.tsx]...')
  })
})

// NOTE: I've intentionally not yet moved these helpers into a separate
// module, to avoid early abstraction. I will if/when we start using them for
// other tests. They are based on the testing patterns we use all over the React
// codebase, so I'm reasonably confident in them.

type TestDataResponse = {
  _res: http.ServerResponse
  resolve: (value: string) => any
  reject: (value: any) => any
}

type TestDataServer = {
  _server: http.Server
  listen: (port: number) => void
  close: () => void
}

// Creates a lightweight HTTP server for use in e2e testing. This simulates the
// data service that would be used in a real Next.js application, whether it's
// direct database access, an ORM, or a higher-level data access layer. The e2e
// test can observe when individual requests are received, and control the
// timing of when the data is fulfilled, without needing to mock any lower
// level I/O.
//
// Receives requests of the form: /?key=foo
//
// Responds in plain text. By default, the response is the key itself, but the
// e2e test can respond with any text it wants.
//
// Examples:
//   response.resolve() // Responds with the key itself
//   response.resolve('custom') // Responds with custom text
//   response.reject(new Error('oops!')) // Responds with a 500 error
//
// Based on the AsyncText pattern used in the React repo.
function createTestDataServer(
  onRequest: (key: string, response: TestDataResponse) => any
): TestDataServer {
  const httpServer = http.createServer(async (req, res) => {
    const searchParams = new URL(req.url, 'http://n').searchParams
    const key = searchParams.get('key')

    if (typeof key !== 'string') {
      res.statusCode = 400
      const msg = 'Missing key parameter'
      res.end(msg)
      return
    }

    const response: TestDataResponse = {
      _res: res,
      resolve(value: string | void) {
        res.end(value === undefined ? key : value)
      },
      reject(error: Error, status?: number) {
        res.statusCode = status ?? 500
        res.end(error.message ?? `Failed to fetch data for "${key}"`)
      },
    }

    try {
      const result = await onRequest(key, response)
      if (typeof result === 'string') {
        response.resolve(result)
      }
    } catch (error) {
      response.reject(error)
    }
  })
  return {
    _server: httpServer,
    listen(port: number) {
      httpServer.listen(port)
    },
    close() {
      httpServer.close()
    },
  }
}

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
function createTestLog() {
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
    const actualEvents = events

    if (pendingExpectation !== null) {
      const error = new Error('Cannot assert while a waitFor() is pending.')
      Error.captureStackTrace(error, assert)
      throw error
    }

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
