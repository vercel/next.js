import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('interception-static-prerender', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/94533.
  // A statically prerendered interception target used to bake
  // `couldBeIntercepted: false` (the `i` field) because the `Vary: next-url`
  // header isn't set during prerendering. A CDN serving that static artifact
  // then taught the client the route wasn't interceptable. The prerendered
  // `.rsc` is what a CDN serves, so asserting on it is the deterministic guard
  // (at runtime the server re-adds `Vary`, masking the bug in `next start`).
  if (isNextStart) {
    it('marks the statically prerendered intercepted target as interceptable', async () => {
      expect(await next.readFile('.next/server/app/login.rsc')).toMatch(
        /"i":true/
      )
      // Non-target routes must not be marked.
      expect(await next.readFile('.next/server/app/index.rsc')).toMatch(
        /"i":false/
      )
    })
  }

  it('intercepts client navigations to the target route', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#to-login').click()
    await retry(async () => {
      expect(await browser.elementByCss('#login-modal').text()).toBe(
        'login modal (intercepted)'
      )
    })
    expect(await browser.hasElementByCssSelector('#login-full-page')).toBe(
      false
    )

    // After a full-page visit to `/login`, client navigations must still
    // intercept (rather than reuse a stale non-intercepted tree).
    await browser.get(`${next.url}/login`)
    await retry(async () => {
      expect(await browser.elementByCss('#login-full-page').text()).toBe(
        'login full page'
      )
    })
    await browser.elementByCss('#to-home').click()
    await retry(async () => {
      expect(await browser.elementByCss('#home').text()).toBe('home page')
    })
    await browser.elementByCss('#to-login').click()
    await retry(async () => {
      expect(await browser.elementByCss('#login-modal').text()).toBe(
        'login modal (intercepted)'
      )
    })
  })
})
