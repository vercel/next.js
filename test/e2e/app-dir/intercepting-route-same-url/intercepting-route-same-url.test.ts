import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('intercepting-route-same-url', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should intercept when navigating from a different route', async () => {
    const browser = await next.browser('/')

    // Click the link to /signin from the home page
    await browser.elementByCss('#signin-link').click()

    // The intercepted modal should appear
    await retry(async () => {
      const text = await browser.elementByCss('#intercepted-modal').text()
      expect(text).toBe('Intercepted Modal')
    })
  })

  it('should not re-intercept when pushing the same intercepted route', async () => {
    const browser = await next.browser('/')

    // Click the link to /signin from the home page, triggering interception
    await browser.elementByCss('#signin-link').click()

    // Verify the intercepted modal appears
    await retry(async () => {
      const text = await browser.elementByCss('#intercepted-modal').text()
      expect(text).toBe('Intercepted Modal')
    })

    // Now push the same route again via router.push - should NOT re-intercept
    await browser.eval('window.next.router.push("/signin")')

    // The intercepted modal should disappear and the full page should render
    await retry(async () => {
      const text = await browser.elementByCss('#full-signin').text()
      expect(text).toBe('Full Signin Page')
    })

    // The intercepted modal should NOT be present
    const hasModal = await browser.eval(
      'document.querySelector("#intercepted-modal") !== null'
    )
    expect(hasModal).toBe(false)
  })
})
