import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type { Page, Request } from 'playwright'

// Prefetching is disabled in dev, and route prediction only happens in a
// production build.
// @force-gate prefetching
describe('optimistic routing - redirect prefetch loop regression', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not loop when a full prefetch of a predicted route is redirected', async () => {
    let act: ReturnType<typeof createRouterAct>

    // Pre-fix, a single router.prefetch of the redirecting URL made the router
    // request that URL again and again, indefinitely. Under that loop, `act`'s
    // flush keeps observing new requests and never settles — so instead of
    // waiting for a jest timeout, each `act` is raced against a promise that
    // rejects once the URL has been requested more times than any correct
    // sequence needs. This fails fast with a legible error on a buggy build
    // and is a no-op on a correct one.
    const REDIRECTING_URL = '/docs/changelog'
    const MAX_REQUESTS_TO_REDIRECTING_URL = 5
    let requestsToRedirectingUrl = 0
    let rejectOnLoop!: (error: Error) => void
    const loopDetected = new Promise<never>((_, reject) => {
      rejectOnLoop = reject
    })
    // Mark the rejection as handled in case it fires while no race is
    // pending; the final assertions still catch it.
    loopDetected.catch(() => {})

    async function actExpectingNoLoop<T>(
      scope: () => Promise<T> | T,
      config?: Parameters<typeof act>[1]
    ): Promise<unknown> {
      const actPromise = act(scope, config)
      // If the race rejects first, `act` keeps running until the page is torn
      // down; swallow its eventual rejection so it doesn't surface as an
      // unhandled promise rejection.
      actPromise.catch(() => {})
      return Promise.race([actPromise, loopDetected])
    }

    const browser = await next.browser('/docs/alpha', {
      beforePageLoad(page: Page) {
        act = createRouterAct(page)
        page.on('request', (request: Request) => {
          if (new URL(request.url()).pathname !== REDIRECTING_URL) {
            return
          }
          requestsToRedirectingUrl++
          if (requestsToRedirectingUrl > MAX_REQUESTS_TO_REDIRECTING_URL) {
            rejectOnLoop(
              new Error(
                `${REDIRECTING_URL} was requested more than ` +
                  `${MAX_REQUESTS_TO_REDIRECTING_URL} times after a single ` +
                  'prefetch. The URL redirects, so one attempt is enough to ' +
                  'learn that; a client that keeps asking is looping.'
              )
            )
          }
        })
      },
    })

    // The initial page load renders /docs/alpha via [collection]/[...slug],
    // which is when the client learns the pattern for that URL shape.
    expect(await browser.elementById('docs-params').text()).toBe('docs/alpha')

    // Reveal the sidebar links. Their routes are predicted from the pattern
    // and their shell is already cached, so revealing them makes no requests —
    // which is also what proves the pattern was learned.
    //
    // They matter for the pre-fix behavior: the redirected response
    // invalidated the whole route cache, and the visible links re-fetched
    // their route trees ahead of the prefetch task, re-learning the pattern
    // the task then predicted the redirecting URL from again.
    await actExpectingNoLoop(async () => {
      for (const slug of ['beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta']) {
        const toggle = await browser.elementByCss(
          `input[data-link-accordion="/docs/${slug}"]`
        )
        await toggle.click()
      }
    }, 'no-requests')

    // Imperatively prefetch the redirecting URL with `kind: 'full'`. The URL
    // matches the learned pattern, so the client predicts its route; the
    // server redirects to /changelog and renders a different tree. The client
    // must take the redirected response, resolve the route for real, and
    // settle. `act` returning at all proves the prefetch queue settled
    // instead of looping.
    await actExpectingNoLoop(async () => {
      const button = await browser.elementByCss(
        `button[data-prefetch-full="${REDIRECTING_URL}"]`
      )
      await button.click()
    })

    // The prefetch completed: navigating to the redirecting URL is served
    // entirely from the cache, and lands on the redirect target.
    await actExpectingNoLoop(async () => {
      await browser.eval(
        `window.next.router.push(${JSON.stringify(REDIRECTING_URL)})`
      )
    }, 'no-requests')
    expect(await browser.elementById('changelog-page').text()).toBe('Changelog')
    expect(await browser.url()).toBe(`${next.url}/changelog`)
  })
})
