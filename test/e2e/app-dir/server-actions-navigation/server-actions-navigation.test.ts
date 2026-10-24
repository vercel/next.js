import { nextTestSetup } from 'e2e-utils'

describe('server action resolving after navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not apply stale server action result after navigation and refresh', async () => {
    const browser = await next.browser('/')

    // Trigger async server action and immediately navigate to /next
    await browser.elementByCss('#run-action').click()

    // Ensure navigation completed
    await browser.waitForElementByCss('#next-page')

    // Wait long enough for:
    // - server action to resolve
    // - delayed router.refresh() on /next to make sure that
    //   the server action has been completed
    await browser.eval(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 5500)
        })
    )

    // Assert we are still on /next after refresh
    const url = await browser.url()
    expect(url.endsWith('/next')).toBe(true)
  })
})
