import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page, Request, Route } from 'playwright'

type RequestKind = 'loading-boundary-prefetch' | 'navigation'

function classifyRouterRequest(
  headers: Record<string, string>
): RequestKind | null {
  if (headers['rsc'] !== '1') {
    return null
  }
  if (headers['next-router-prefetch'] === undefined) {
    return 'navigation'
  }
  // A LoadingBoundary prefetch sends the router state tree and no per-segment
  // header; the server renders it up to the first loading boundary.
  if (
    headers['next-router-prefetch'] === '1' &&
    headers['next-router-state-tree'] !== undefined &&
    headers['next-router-segment-prefetch'] === undefined
  ) {
    return 'loading-boundary-prefetch'
  }
  return null
}

// Holds the listed router requests until the test releases them, so the order
// in which responses reach the browser is under the test's control.
function holdRouterRequests(
  page: Page,
  toHold: Array<{ kind: RequestKind; pathname: string }>
) {
  const keyOf = (kind: RequestKind, pathname: string) => `${kind} ${pathname}`
  const keys = new Set(
    toHold.map(({ kind, pathname }) => keyOf(kind, pathname))
  )
  type HeldRequest = {
    promise: Promise<[Route, Request]>
    resolve: (value: [Route, Request]) => void
  }
  const held = new Map<string, HeldRequest>()
  const slot = (key: string) => {
    let entry = held.get(key)
    if (entry === undefined) {
      let resolve!: HeldRequest['resolve']
      const promise = new Promise<[Route, Request]>((r) => (resolve = r))
      entry = { promise, resolve }
      held.set(key, entry)
    }
    return entry
  }

  page.route('**/*', async (route) => {
    const request = route.request()
    const kind = classifyRouterRequest(await request.allHeaders())
    const key =
      kind !== null ? keyOf(kind, new URL(request.url()).pathname) : null
    if (key === null || !keys.has(key)) {
      await route.continue()
      return
    }
    slot(key).resolve([route, request])
  })

  return {
    // Resolves once the request has been made (and is being held). The
    // returned function lets it through and waits until the browser has
    // received the response.
    async waitFor(kind: RequestKind, pathname: string) {
      const [route, request] = await slot(keyOf(kind, pathname)).promise
      return async function release() {
        // The router may cancel the fetch once it has read what it needs, so
        // the request can end as either "finished" or "failed".
        const settled = new Promise<void>((resolve) => {
          const onSettled = (r: Request) => r === request && resolve()
          page.on('requestfinished', onSettled)
          page.on('requestfailed', onSettled)
        })
        await route.continue()
        await settled
        expect((await request.response())?.status()).toBe(200)
      }
    },
  }
}

// Counts animation frames in which the content slot rendered nothing at all
// (neither the previous page, nor a loading boundary, nor the new page), and
// frames in which the document had no title.
async function startCountingBlankFrames(browser: {
  eval: (script: string) => Promise<unknown>
}) {
  await browser.eval(`(() => {
    window.__emptySlotFrames = 0
    window.__emptyTitleFrames = 0
    const tick = () => {
      const slot = document.getElementById('slot')
      if (slot !== null && slot.textContent === '') {
        window.__emptySlotFrames++
      }
      if (document.title === '') {
        window.__emptyTitleFrames++
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })()`)
}

async function expectNoBlankFrames(browser: {
  eval: (script: string) => Promise<unknown>
}) {
  expect(
    await browser.eval(
      '({ emptySlot: window.__emptySlotFrames, emptyTitle: window.__emptyTitleFrames })'
    )
  ).toEqual({ emptySlot: 0, emptyTitle: 0 })
}

async function waitForFrames(
  browser: { eval: (script: string) => Promise<unknown> },
  count: number
) {
  await browser.eval(`new Promise((resolve) => {
    let remaining = ${count}
    const tick = () => (--remaining === 0 ? resolve() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  })`)
}

// Prefetching is disabled in dev.
// @force-gate prefetching
describe('navigating while a loading-boundary prefetch is in flight', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('shows the loading boundary, not an empty segment, when the prefetch lands before the page', async () => {
    let requests: ReturnType<typeof holdRouterRequests>
    const browser = await next.browser('/shared', {
      beforePageLoad(page: Page) {
        requests = holdRouterRequests(page, [
          {
            kind: 'loading-boundary-prefetch',
            pathname: '/shared/destination',
          },
          { kind: 'navigation', pathname: '/shared/destination' },
        ])
      },
    })

    // The link is in the viewport, so its LoadingBoundary prefetch starts.
    // Every segment of the target that isn't cached yet now has a pending
    // segment cache entry, including the page segment, which the server will
    // not render because it is below the loading boundary.
    const releasePrefetch = await requests!.waitFor(
      'loading-boundary-prefetch',
      '/shared/destination'
    )
    await startCountingBlankFrames(browser)

    // Navigate while the prefetch is still in flight.
    await browser.elementByCss('a[href="/shared/destination"]').click()
    const releaseNavigation = await requests!.waitFor(
      'navigation',
      '/shared/destination'
    )

    // The prefetch response arrives before the page's own response. It
    // carries the loading boundary but not the page segment. The navigation
    // should show the loading boundary right away, without waiting for its
    // own response, and should never render an empty segment.
    await releasePrefetch()
    await retry(async () => {
      expect(await browser.elementById('loading').text()).toBe(
        'Loading destination...'
      )
    })
    await waitForFrames(browser, 10)
    expect(await browser.eval('window.__emptySlotFrames')).toBe(0)

    await releaseNavigation()
    await retry(async () => {
      expect(await browser.elementById('destination').text()).toBe(
        'Destination page'
      )
    })
    // The title comes from the prefetched head when the prefetch includes it.
    // The server may return that head partial, in which case the title can be
    // briefly empty until the navigation responds, so only the final title
    // is asserted here.
    expect(await browser.eval('window.__emptySlotFrames')).toBe(0)
    expect(await browser.eval('document.title')).toBe('Destination page')
  })

  it('renders the page as soon as the navigation responds, even if the prefetch is still in flight', async () => {
    let requests: ReturnType<typeof holdRouterRequests>
    const browser = await next.browser('/shared', {
      beforePageLoad(page: Page) {
        requests = holdRouterRequests(page, [
          {
            kind: 'loading-boundary-prefetch',
            pathname: '/shared/destination',
          },
        ])
      },
    })

    const releasePrefetch = await requests!.waitFor(
      'loading-boundary-prefetch',
      '/shared/destination'
    )
    await startCountingBlankFrames(browser)

    // The navigation's own response is not held, so it arrives first. The
    // page must not wait for the prefetch.
    await browser.elementByCss('a[href="/shared/destination"]').click()
    await retry(async () => {
      expect(await browser.elementById('destination').text()).toBe(
        'Destination page'
      )
    })
    await expectNoBlankFrames(browser)
    expect(await browser.eval('document.title')).toBe('Destination page')

    await releasePrefetch()
  })

  it('keeps the document title when navigating twice while prefetches are in flight', async () => {
    let requests: ReturnType<typeof holdRouterRequests>
    const browser = await next.browser('/shared', {
      beforePageLoad(page: Page) {
        requests = holdRouterRequests(page, [
          {
            kind: 'loading-boundary-prefetch',
            pathname: '/shared/destination',
          },
          {
            kind: 'loading-boundary-prefetch',
            pathname: '/shared/destination/detail',
          },
          { kind: 'navigation', pathname: '/shared/destination/detail' },
        ])
      },
    })

    const releaseDestinationPrefetch = await requests!.waitFor(
      'loading-boundary-prefetch',
      '/shared/destination'
    )
    const releaseDetailPrefetch = await requests!.waitFor(
      'loading-boundary-prefetch',
      '/shared/destination/detail'
    )
    await startCountingBlankFrames(browser)

    // The second navigation is computed on top of the first, which has not
    // committed yet.
    await browser.elementByCss('a[href="/shared/destination"]').click()
    await browser.elementByCss('a[href="/shared/destination/detail"]').click()
    const releaseNavigation = await requests!.waitFor(
      'navigation',
      '/shared/destination/detail'
    )

    await releaseDestinationPrefetch()
    await releaseDetailPrefetch()
    await retry(async () => {
      expect(await browser.elementById('loading').text()).toBe(
        'Loading destination...'
      )
    })
    await waitForFrames(browser, 10)
    await releaseNavigation()

    await retry(async () => {
      expect(await browser.elementById('detail').text()).toBe('Detail page')
    })
    await retry(async () => {
      expect(await browser.eval('document.title')).toBe('Detail page')
    })
    // The detail page is below the loading boundary, so the prefetch can't
    // render its metadata: the title may be briefly empty until the
    // navigation responds. It must not stay empty, and the content slot must
    // never be empty.
    expect(await browser.eval('window.__emptySlotFrames')).toBe(0)
  })
})
