import { nextTestSetup } from 'e2e-utils'

describe('external-redirect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('regression: Server Action triggered from onClick redirects to external URL', async () => {
    let page
    const browser = await next.browser('/', {
      async beforePageLoad(p) {
        page = p
        await page.route('**/*', (route) => {
          const req = route.request()
          // Intercept the request to the external page and mock the response.
          if (req.url().includes('localhost:9292')) {
            return route.fulfill({
              status: 200,
              body: '<!DOCTYPE html><html><body>External page</body></html>',
            })
          }
          return route.continue()
        })
      },
    })
    const button = await browser.elementById(
      'external-redirect-from-action-on-click'
    )
    await button.click()
    await page.waitForNavigation('http://localhost:9292')
    expect(await page.innerHTML('body')).toBe('External page')
  })
})
