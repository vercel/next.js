import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import { createRouterAct } from 'router-act'
import type { Page, Request } from 'playwright'

// Prefetching is disabled in dev, and route prediction only happens in a
// production build.
// @force-gate prefetching
describe('optimistic routing - rewrite prefetch loop regression', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not loop when a predicted route is rewritten to a different param value', async () => {
    let act: ReturnType<typeof createRouterAct>
    let requestsToOld = 0

    const browser = await next.browser('/', {
      beforePageLoad(page: Page) {
        act = createRouterAct(page)
        page.on('request', (request: Request) => {
          if (new URL(request.url()).pathname === '/old') {
            requestsToOld++
          }
        })
      },
    })

    // Prefetch /docs/one. The client learns the [...slug] pattern from the
    // response.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/docs/one"]')
        .click()
    })

    // Prefetch /old. Its route is predicted from the pattern, so the client
    // requests its segments directly. The server rewrites /old to /docs/one,
    // so the response is for a different param value than the one the client
    // predicted. With the bug, the client writes the response under
    // /docs/one, never fulfills the /old entry, and requests it again,
    // indefinitely.
    await browser.elementByCss('input[data-link-accordion="/old"]').click()
    await waitFor(2000)

    expect(requestsToOld).toBeLessThanOrEqual(5)
  })
})
