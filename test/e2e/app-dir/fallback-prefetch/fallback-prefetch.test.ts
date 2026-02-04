import { nextTestSetup } from 'e2e-utils'

describe('fallback-prefetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should prefetch the page without errors', async () => {
    let hasNetworkError = false
    const browser = await next.browser('/', {
      beforePageLoad: (page) => {
        page.on('response', (response) => {
          if (!response.ok()) {
            hasNetworkError = true
          }
        })
      },
    })

    // set a flag on the window to ensure we don't perform an MPA navigation when navigating to the prefetched link
    await browser.eval('window.beforeNav = 1')
    await browser.elementById('link-to-random').click()

    await browser.waitForElementByCss('#random-page')

    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(hasNetworkError).toBe(false)
  })
})
