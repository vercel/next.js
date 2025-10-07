import { nextTestSetup, isNextDev } from 'e2e-utils'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_RSC_UNION_QUERY,
  RSC_HEADER,
} from 'next/src/client/components/app-router-headers'
import type { Page, Request as PlaywrightRequest } from 'playwright'
import { WebdriverOptions } from 'next-webdriver'
import { retry } from 'next-test-utils'

const _describe =
  // prefetching is disabled in dev.
  isNextDev ? describe.skip : describe

_describe('app dir - form prefetching', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      typescript: {
        ignoreBuildErrors: true,
      },
    },
  })

  it("should prefetch a loading state for the form's target", async () => {
    const interceptor = new RequestInterceptor({
      pattern: '**/search*',
      requestFilter: async (request) => {
        // only capture RSC requests that *aren't* prefetches
        const headers = await request.allHeaders()
        const isRSC = headers[RSC_HEADER] === '1'
        const isPrefetch = !!headers[NEXT_ROUTER_PREFETCH_HEADER]
        return isRSC && !isPrefetch
      },
      log: true,
    })

    const session = await next.browser('/forms/basic', {
      beforePageLoad: interceptor.beforePageLoad,
    })

    await session.waitForIdleNetwork()
    interceptor.start()

    const searchInput = await session.elementByCss('input[name="query"]')
    const query = 'my search'
    await searchInput.fill(query)

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    const targetHref = '/search?' + new URLSearchParams({ query })

    // we're blocking requests, so the navigation won't go through,
    // but we should still see the prefetched loading state
    expect(await session.waitForElementByCss('#loading').text()).toBe(
      'Loading...'
    )

    // We only resolve the dynamic request after we've confirmed loading exists,
    // to avoid a race where the dynamic request handles the loading state instead.
    const navigationRequest = interceptor.pendingRequests.get(targetHref)
    expect(navigationRequest).toBeDefined()
    // allow the navigation to continue
    await navigationRequest.resolve()

    const result = await session.waitForElementByCss('#search-results').text()
    expect(result).toInclude(`query: "${query}"`)
  })

  it('should not prefetch when prefetch is set to false`', async () => {
    const interceptor = new RequestInterceptor({
      pattern: '**/search*',
      requestFilter: async (request) => {
        // capture all RSC requests, prefetch or not
        const headers = await request.allHeaders()
        const isRSC = headers[RSC_HEADER] === '1'
        return isRSC
      },
      log: true,
    })

    interceptor.start()

    const session = await next.browser('/forms/prefetch-false', {
      beforePageLoad: interceptor.beforePageLoad,
    })

    await session.waitForIdleNetwork()

    // no prefetches should have been captured
    expect(interceptor.pendingRequests).toBeEmpty()

    const searchInput = await session.elementByCss('input[name="query"]')
    const query = 'my search'
    await searchInput.fill(query)

    const submitButton = await session.elementByCss('[type="submit"]')
    await submitButton.click()

    const targetHref = '/search?' + new URLSearchParams({ query })

    // wait for the pending request to appear
    const navigationRequest = await retry(
      async () => {
        const request = interceptor.pendingRequests.get(targetHref)
        expect(request).toBeDefined()
        return request
      },
      undefined,
      100
    )

    // the loading state should not be visible, because we didn't prefetch it
    expect(await session.elementsByCss('#loading')).toEqual([])

    // allow the navigation to continue
    navigationRequest.resolve()

    // now, the loading state should stream in dynamically
    expect(await session.waitForElementByCss('#loading').text()).toBe(
      'Loading...'
    )

    const result = await session.waitForElementByCss('#search-results').text()
    expect(result).toInclude(`query: "${query}"`)
  })
})

// =====================================================================

type PlaywrightRoutePattern = Parameters<Page['route']>[0]
type PlaywrightRouteOptions = Parameters<Page['route']>[2]
type BeforePageLoadFn = NonNullable<WebdriverOptions['beforePageLoad']>

type RequestInterceptorOptions = {
  pattern: PlaywrightRoutePattern
  requestFilter?: (request: PlaywrightRequest) => boolean | Promise<boolean>
  timeout?: number
  log?: boolean
  routeOptions?: PlaywrightRouteOptions
}

type InterceptedRequest = {
  request: PlaywrightRequest
  resolve(): Promise<void>
}

class RequestInterceptor {
  pendingRequests: Map<string, InterceptedRequest> = new Map()
  isEnabled = false
  constructor(private opts: RequestInterceptorOptions) {}

  private getRequestKey(request: PlaywrightRequest) {
    // could cause issues for a generic util,
    // but it's fine for the purposes of intercepting navigations.
    // if we wanted this to be more generic, we could expose a `getRequest(...)` method
    // to allow partial matching (e.g. by pathname + search only)
    const url = new URL(request.url())
    url.searchParams.delete(NEXT_RSC_UNION_QUERY)
    return url.pathname + url.search
  }

  start() {
    this.isEnabled = true
  }

  stop() {
    this.isEnabled = false
  }

  beforePageLoad: BeforePageLoadFn = (page) => {
    const { opts } = this
    page.route(
      opts.pattern,
      async (route, request) => {
        if (!this.isEnabled) {
          return route.continue()
        }

        const shouldIntercept = opts.requestFilter
          ? opts.requestFilter(request)
          : true

        const url = request.url()

        if (!shouldIntercept) {
          if (opts.log) {
            console.log('[interceptor] not intercepting:', url)
          }
          return route.continue()
        }

        const requestKey = this.getRequestKey(request)

        if (opts.log) {
          console.log(
            '[interceptor] intercepting request:',
            url,
            `(key: ${requestKey})`
          )
        }

        if (this.pendingRequests.has(requestKey)) {
          throw new Error(
            `Interceptor received duplicate request (key: ${JSON.stringify(requestKey)}, url: ${JSON.stringify(url)})`
          )
        }

        // Create a promise that will be resolved by the later test code
        const blocked = promiseWithResolvers<void>()

        this.pendingRequests.set(requestKey, {
          request,
          resolve: async () => {
            if (opts.log) {
              console.log('[interceptor] resolving intercepted request:', url)
            }
            this.pendingRequests.delete(requestKey)
            await route.continue()
            // wait a moment to ensure the response is received
            await new Promise((res) => setTimeout(res, 500))
            blocked.resolve()
          },
        })

        // Await the promise to effectively stall the request
        const timeout = opts.timeout ?? 5000
        await Promise.race([
          blocked.promise,
          timeoutPromise(
            opts.timeout ?? 5000,
            `Intercepted request for '${url}' was not resolved within ${timeout}ms`
          ),
        ])
      },
      opts.routeOptions
    )
  }
}

function promiseWithResolvers<T>() {
  let resolve: (value: T) => void = undefined!
  let reject: (error: unknown) => void = undefined!
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}

function timeoutPromise(duration: number, message = 'Timeout') {
  return new Promise<never>((_, reject) =>
    AbortSignal.timeout(duration).addEventListener('abort', () =>
      reject(new Error(message))
    )
  )
}
