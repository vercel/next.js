import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('navigating without a prefetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('can show a loading boundary from the dynamic response', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Navigate to a dynamic page with a `loading.tsx` without a prefetch.
    await act(async () => {
      await browser.elementByCss('a[href="/with-loading"]').click()
    })

    // The page suspends on the client, so we should display the `loading` that we got from the dynamic response.
    expect(
      await browser
        .elementByCss('#loading-component', { state: 'visible' })
        .text()
    ).toContain('Loading...')
  })
})
