import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('segment cache (blocking prerender)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is not enabled in dev', () => {})
    return
  }

  it('prerenders prefetch requests on-demand for unknown params', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    await act(
      async () => {
        // Reveal the link to trigger a prefetch.
        const reveal = await browser.elementByCss(
          'input[type="checkbox"][data-link-accordion="/cached-layout/on-demand"]'
        )
        await reveal.click()
      },
      { includes: 'Shell for on-demand' }
    )
  })
})
