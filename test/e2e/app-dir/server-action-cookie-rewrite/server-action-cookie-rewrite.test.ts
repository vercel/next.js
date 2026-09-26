import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-action-cookie-rewrite', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use a cookie set by a Server Action when refreshing the route', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementById('logged-out').text()).toBe(
      'You are logged out'
    )

    await browser.elementById('log-in').click()

    await retry(async () => {
      expect(await browser.eval('document.cookie')).toContain('isLoggedIn=1')
    })

    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toContain(
        'You are logged in'
      )
    })
  })
})
