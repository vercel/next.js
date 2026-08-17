import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type { Page, Request } from 'playwright'

// Regression fixture for https://github.com/vercel/next.js/issues/97135
//
// Route shape (no rewrites, no special config):
//   app/@modal/[...catchAll]/page   <- catch-all in a root parallel slot
//   app/[username]/followers/page   <- current page nested under a sibling
//                                      dynamic segment
//
// On an initial load of /alice/followers, Known Routes discovery
// (segment-cache/optimistic-routes.ts) walks BOTH parallel branches against
// the same URL parts. The @modal branch's [...catchAll] segment reuses the
// dynamic trie node that the children branch just created for [username]
// (discoverDynamicChild does not compare param name/type), absorbs all
// remaining URL parts, and stores the full /alice/followers route entry as
// the [username] node's direct pattern. Any subsequent 1-part URL
// (/user3, /viewer, ...) then matches that poisoned pattern and is predicted
// as the *followers* page, which the server can never satisfy -> the
// prefetch task livelocks, re-issuing the same request hundreds of times
// per second.
describe('modal-catchall-sibling-dynamic-prefetch-loop', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Only reproduces in a production build; dev does not predict routes
    // from a learned pattern (it resolves routes on demand).
    test('skipped in dev mode', () => {})
    return
  }

  // On a buggy build the loop re-requests the same URL indefinitely, so
  // `act` never settles. Instead of waiting for the jest timeout, fail fast
  // once any single pathname has been requested this many times.
  const MAX_RSC_REQUESTS_PER_PATH = 25

  it('does not loop prefetches when a root slot catch-all shares a trie node with a sibling dynamic segment', async () => {
    let act: ReturnType<typeof createRouterAct>

    const rscRequestCounts = new Map<string, number>()
    let excessRequests: string | null = null
    let rejectOnExcess!: (error: Error) => void
    const excessDetected = new Promise<never>((_, reject) => {
      rejectOnExcess = reject
    })
    // Mark as handled in case it fires while no race is pending; the final
    // assertion on `excessRequests` still catches it.
    excessDetected.catch(() => {})

    async function actExpectingToSettle<T>(
      scope: () => Promise<T> | T,
      config?: Parameters<typeof act>[1]
    ): Promise<unknown> {
      const actPromise = act(scope, config)
      // If the race rejects first, `act` keeps running until the page is
      // torn down; swallow its eventual rejection so it doesn't surface as
      // an unhandled promise rejection.
      actPromise.catch(() => {})
      return Promise.race([actPromise, excessDetected])
    }

    const browser = await next.browser('/alice/followers', {
      beforePageLoad(page: Page) {
        act = createRouterAct(page)
        page.on('request', (request: Request) => {
          const headers = request.headers()
          if (headers['rsc'] === undefined) {
            return
          }
          const pathname = new URL(request.url()).pathname
          const count = (rscRequestCounts.get(pathname) ?? 0) + 1
          rscRequestCounts.set(pathname, count)
          if (count > MAX_RSC_REQUESTS_PER_PATH && excessRequests === null) {
            excessRequests =
              `Observed more than ${MAX_RSC_REQUESTS_PER_PATH} RSC requests ` +
              `for ${pathname} (state tree of last request: ` +
              `${headers['next-router-state-tree'] ?? '<none>'})`
            rejectOnExcess(
              new Error(
                'Prefetch livelock detected: the client keeps re-requesting ' +
                  'the same URL. ' +
                  excessRequests
              )
            )
          }
        })
      },
    })

    // The initial page load is when the client learns the (poisoned) route
    // pattern for /alice/followers.
    expect(await browser.elementById('followers-heading').text()).toBe(
      'Followers of alice'
    )

    // Reveal a single link whose URL matches the poisoned pattern. Pre-fix,
    // this immediately enters the livelock (~hundreds of requests/sec).
    await actExpectingToSettle(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/user3"]'
      )
      await toggle.click()
    })
    expect(excessRequests).toBeNull()

    // Reveal several more links in one act scope to recreate the issue's
    // many-visible-links scenario (concurrent prefetch tasks all matching
    // the same poisoned pattern).
    await actExpectingToSettle(async () => {
      for (const href of ['/user0', '/user1', '/user5', '/viewer']) {
        const toggle = await browser.elementByCss(
          `input[data-link-accordion="${href}"]`
        )
        await toggle.click()
      }
    })
    expect(excessRequests).toBeNull()

    // Navigate to one of the prefetched links and confirm it renders the
    // real profile page (not a mispredicted followers page).
    const link = await browser.elementByCss('a[href="/user3"]')
    await link.click()
    expect(await browser.elementById('profile-heading').text()).toBe(
      'Profile of user3'
    )

    expect(excessRequests).toBeNull()
  })
})
