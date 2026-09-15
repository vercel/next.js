import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('optimistic routing - rewrite sibling regression', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in dev mode', () => {})
    return
  }

  it('prefetches a rewritten link with its own route instead of a sibling pattern', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/en"]'
        )
        await toggle.click()
      },
      { includes: 'Home page: en' }
    )

    for (const slug of ['alpha', 'beta']) {
      await act(
        async () => {
          const toggle = await browser.elementByCss(
            `input[data-link-accordion="/${slug}"]`
          )
          await toggle.click()
        },
        { includes: `Slug page: ${slug}` }
      )
    }
  })
})
