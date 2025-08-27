import { nextTestSetup } from 'e2e-utils'
import {
  createRequestTracker,
  RequestTracker,
} from '../../../../lib/e2e-utils/request-tracker'
import {
  RootTreePrefetch,
  TreePrefetch,
} from 'next/dist/server/app-render/collect-segment-data'

describe('export const unstable_prefetch = ...', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('disabled in development', () => {})
    return
  }

  // TODO: these tests aren't very good, but since the client-side part isn't implmented yet,
  // asserting on what the tree prefetch response contains is the best we can do.
  // They should be replaced with `act()` tests when the client-side changes are made.

  async function captureTreePrefetchResponse(
    requestTracker: RequestTracker,
    action: () => Promise<void>
  ): Promise<string> {
    const [, response] = await requestTracker.captureResponse(action, {
      async request(req) {
        const headers = req.headers()
        return headers['next-router-segment-prefetch'] === '/_tree'
      },
    })
    return response.text()
  }

  /** Hackily parse the first row of the RSC response. */
  function parseRouteTreeFromTreePrefetchResponse(response: string) {
    // Get row 0, the root object.
    const rowMatch = response.match(/(?:^|\n)0:(.*?)\n/)
    if (!rowMatch) {
      throw new Error('Failed to find row 0 in route tree flight data')
    }
    // `tree` is essentially plain JSON, so it's fine to not do full RSC parsing.
    const data = JSON.parse(rowMatch[1]) as RootTreePrefetch
    return data.tree
  }

  it('does not mark for segments with prefetch: "static" as runtime-prefetchable', async () => {
    const browser = await next.browser('/')
    const requestTracker = createRequestTracker(browser)

    // Reveal the link to trigger a runtime prefetch for one value of the dynamic param
    const response = await captureTreePrefetchResponse(
      requestTracker,
      async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/prefetch-static"]`
        )
        await linkToggle.click()
      }
    )

    expect(parseRouteTreeFromTreePrefetchResponse(response)).toEqual(
      expect.objectContaining({
        name: '',
        shouldUseRuntimePrefetch: false,
        slots: {
          children: expect.objectContaining({
            name: 'prefetch-static',
            shouldUseRuntimePrefetch: false,
            slots: {
              children: expect.objectContaining({
                name: '__PAGE__',
                shouldUseRuntimePrefetch: false, // <-----------------
              }),
            },
          }),
        },
      })
    )
  })

  it('marks segments with prefetch: "runtime" as runtime-prefetchable', async () => {
    const browser = await next.browser('/')
    const requestTracker = createRequestTracker(browser)

    // Reveal the link to trigger a runtime prefetch for one value of the dynamic param
    const response = await captureTreePrefetchResponse(
      requestTracker,
      async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/prefetch-runtime"]`
        )
        await linkToggle.click()
      }
    )

    expect(parseRouteTreeFromTreePrefetchResponse(response)).toEqual(
      expect.objectContaining({
        name: '',
        shouldUseRuntimePrefetch: false,
        slots: {
          children: expect.objectContaining({
            name: 'prefetch-runtime',
            shouldUseRuntimePrefetch: false,
            slots: {
              children: expect.objectContaining({
                name: '__PAGE__',
                shouldUseRuntimePrefetch: true, // <-----------------
                slots: null,
              }),
            },
          }),
        },
      })
    )
  })

  it('defaults segments to static if no config is specified', async () => {
    const browser = await next.browser('/')
    const requestTracker = createRequestTracker(browser)

    // Reveal the link to trigger a runtime prefetch for one value of the dynamic param
    const response = await captureTreePrefetchResponse(
      requestTracker,
      async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/no-prefetch"]`
        )
        await linkToggle.click()
      }
    )

    expect(parseRouteTreeFromTreePrefetchResponse(response)).toEqual(
      expect.objectContaining({
        name: '',
        shouldUseRuntimePrefetch: false,
        slots: {
          children: expect.objectContaining({
            name: 'no-prefetch',
            shouldUseRuntimePrefetch: false,
            slots: {
              children: expect.objectContaining({
                name: '__PAGE__',
                shouldUseRuntimePrefetch: false, // <-----------------
                slots: null,
              }),
            },
          }),
        },
      }) satisfies TreePrefetch
    )
  })
  it('does not mark a "static" segment that is a child of a "runtime" segment as runtime-prefetchable', async () => {
    const browser = await next.browser('/')
    const requestTracker = createRequestTracker(browser)

    // Reveal the link to trigger a runtime prefetch for one value of the dynamic param
    const response = await captureTreePrefetchResponse(
      requestTracker,
      async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/nested-prefetch-static"]`
        )
        await linkToggle.click()
      }
    )

    expect(parseRouteTreeFromTreePrefetchResponse(response)).toEqual(
      expect.objectContaining({
        name: '',
        shouldUseRuntimePrefetch: false,
        slots: {
          children: expect.objectContaining({
            name: 'nested-prefetch-static',
            shouldUseRuntimePrefetch: true, // <-----------------
            slots: {
              children: expect.objectContaining({
                name: '__PAGE__',
                shouldUseRuntimePrefetch: false, // <-----------------
                slots: null,
              }),
            },
          }),
        },
      }) satisfies TreePrefetch
    )
  })
})
