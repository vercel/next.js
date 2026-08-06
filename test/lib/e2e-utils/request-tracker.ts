import {
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
} from 'playwright'
import { inspect } from 'node:util'
import { Playwright } from '../browsers/playwright'

export type RequestMatcherObject = {
  pathname: string
  search?: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'HEAD' | 'OPTIONS'
}

export type RequestMatcher =
  | RequestMatcherObject
  | ((request: PlaywrightRequest) => Promise<boolean>)

export type RequestTracker = ReturnType<typeof createRequestTracker>

/** Allows capturing responses to requests that happened as a result of running a callback. */
export function createRequestTracker(browser: Playwright) {
  /** Run a callback and capture requests with the given `method` and `pathname`. */
  async function captureResponse<T>(
    action: () => Promise<T>,
    {
      request: requestMatcher,
      timeoutMs = 5000,
    }: {
      request: RequestMatcher
      timeoutMs?: number
    }
  ): Promise<[result: T, captured: PlaywrightResponse]> {
    const isMatchingRequest = async (request: PlaywrightRequest) => {
      if (typeof requestMatcher === 'function') {
        // This can be async to allow matching on things like `request.allHeaders()` which is a promise.
        return await requestMatcher(request)
      } else {
        const url = new URL(request.url())
        if (requestMatcher.pathname !== url.pathname) {
          return false
        }
        if (requestMatcher.search !== undefined) {
          if (url.search !== requestMatcher.search) {
            return false
          }
        }
        if (requestMatcher.method !== undefined) {
          if (request.method() !== requestMatcher.method) {
            return false
          }
        }
        return true
      }
    }

    const responseCtrl = promiseWithResolvers<PlaywrightResponse>()
    let isSettled = false

    let capturedRequest: PlaywrightRequest | undefined

    const cleanups: (() => void)[] = []

    // Make sure we clean up all event listeners and timers after we're done.
    responseCtrl.promise.finally(() => {
      isSettled = true
      cleanups.forEach((cb) => cb())
    })

    // Listen for requests that match the criteria.
    const onRequest = async (request: PlaywrightRequest) => {
      if (!(await isMatchingRequest(request))) {
        return
      }

      // If `capturedRequest` is already set, then we've got multiple requests that match the criteria.
      // This is currently not supported, though if needed, we could extend the API
      // to allow capturing multiple requests and returning them as an array.
      if (capturedRequest) {
        const criteriaDescription =
          typeof requestMatcher === 'function'
            ? 'the specified criteria'
            : inspect(requestMatcher)
        return responseCtrl.reject(
          new Error(
            [
              `Captured multiple requests that match ${criteriaDescription} during a \`captureResponse\` call:`,
              ...[capturedRequest, request].map(
                (req) => `  - ${req.method} ${req.url}`
              ),
              'This is currently not supported.',
            ].join('\n')
          )
        )
      }

      // We found a request that matches our criteria. Now we'll wait for a response.
      capturedRequest = request
      console.log(
        `[request-tracker] request: ${request.method()} ${request.url()}` +
          (['POST', 'PUT', 'PATCH'].includes(request.method())
            ? ` (content-type: ${request.headers()['content-type']})`
            : '')
      )
      const onResponse = (response: PlaywrightResponse) => {
        if (isSettled) {
          return
        }
        if (response.request() === request) {
          // We found a response to our request. We're done.
          console.log(`[request-tracker] response: ${response.status()}`)
          return responseCtrl.resolve(response)
        }
      }
      browser.on('response', onResponse)
      cleanups.push(() => browser.off('response', onResponse))
    }

    // Install the handler before running the action callback to avoid races.
    browser.on('request', onRequest)
    cleanups.push(() => browser.off('request', onRequest))

    // Run the action callback. We expect this to result in requests being initiated.
    // If this doesn't happen before the specified timeout, we'll error below.
    const actionPromise = Promise.resolve().then(action)

    const resultPromise = Promise.all([
      actionPromise,
      responseCtrl.promise,
    ] as const)

    actionPromise.then(
      () => {
        // The action callback and the request it triggered can finish before this gets the chance to run.
        // In that case, we don't need to install the timeout at all.
        if (isSettled) {
          return
        }

        // After the action callback resolves, start a timer.
        // If we don't capture a request/response pair within that time limit, error.
        const abortTimeoutId = setTimeout(() => {
          if (isSettled) {
            return
          }
          return responseCtrl.reject(
            new Error(
              capturedRequest === undefined
                ? `Did not intercept a request within ${timeoutMs}ms of the action callback finishing`
                : `Did not intercept a response within ${timeoutMs}ms of the action callback finishing`
            )
          )
        }, timeoutMs)
        cleanups.push(() => clearTimeout(abortTimeoutId))
      },
      () => {
        // If the action callback errored, we don't want to reject the response promise,
        // because then jest would unnecessarily print both errors.
        // We're returning a `Promise.all` that'll reject because `actionPromise` rejected,
        // so we can just quietly resolve this with `null` -- it will never reach the caller anyway.
        return responseCtrl.resolve(null!)
      }
    )

    return resultPromise
  }

  return { captureResponse }
}

function promiseWithResolvers<T>() {
  let resolve: (value: T) => void = undefined!
  let reject: (error: unknown) => void = undefined!
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}
