import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('segment cache memory pressure', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development / deployment', () => {})
    return
  }

  it('evicts least recently used prefetch data once cache size exceeds limit', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/memory-pressure', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    const switchToTab1 = await browser.elementByCss(
      'input[type="radio"][value="1"]'
    )
    const switchToTab2 = await browser.elementByCss(
      'input[type="radio"][value="2"]'
    )

    // Switch to tab 1 to kick off a prefetch for a link to Page 0.
    await act(
      async () => {
        await switchToTab1.click()
      },
      { includes: 'Page 0.' }
    )

    // Switching to tab 2 causes the cache to overflow, evicting the prefetch
    // for the Page 0 link.
    await act(
      async () => {
        await switchToTab2.click()
      },
      { includes: 'Page 1.' }
    )

    // Switching back to tab 1 initiates a new prefetch for Page 0. If
    // there are no requests, that means the prefetch was not evicted correctly.
    await act(
      async () => {
        await switchToTab1.click()
      },
      {
        includes: 'Page 0.',
      }
    )
  })
})
