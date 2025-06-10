import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('RSC Redirect', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it.each([
    {
      path: '/next-config-redirect',
      expectedStatus: 278,
      skipNextDeploy: true,
    },
    { path: '/old-about', expectedStatus: 278 },
    { path: '/rsc-redirect', expectedStatus: 200 },
  ])(
    'should handle $path redirect with correct status code',
    async ({ path, expectedStatus, skipNextDeploy }) => {
      if (skipNextDeploy && isNextDeploy) {
        return
      }
      const statusCodes: number[] = []
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          page.on('response', (res) => {
            statusCodes.push(res.status())
          })
        },
      })

      // Click the link
      await browser.elementByCss(`a[href="${path}"]`).click()
      await browser.waitForIdleNetwork()
      // First check the URL to ensure we were redirected
      await retry(async () => {
        expect(await browser.url()).toBe(`${next.url}/about`)
      })

      // Then check the content to ensure the page loaded correctly
      await browser.waitForElementByCss('[data-testid="about-page"]')
      const content = await browser
        .elementByCss('[data-testid="about-page"]')
        .text()
      expect(content).toBe('About')

      // Finally check that the expected status code exists in the responses
      expect(statusCodes).toContain(expectedStatus)
      // Ensure we don't get standard HTTP redirect status codes
      expect(statusCodes).not.toContain(307)
      expect(statusCodes).not.toContain(308)
    }
  )
})
