import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-use-selected-layout-segment', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('hard nav to router page and soft nav around other router pages', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/^$/)
    })

    await browser.elementByCss('[href="/foo"]').click()
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/foo/)
    })
  })

  it('hard nav to router page and soft nav to parallel routes', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/^$/)
    })

    // soft nav to /login, since both @nav and @auth has /login defined, we expect both navSegment and authSegment to be 'login'
    await browser.elementByCss('[href="/login"]').click()
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/login/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(/login/)
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/^$/)
    })

    // when navigating to /reset, the @auth slot will render the /reset page ('reset') while maintaining the currently active page for the @nav slot ('login') since /reset is only defined in @auth
    await browser.elementByCss('[href="/reset"]').click()
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/login/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(/reset/)
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/^$/)
    })

    // when navigating to nested path /reset/withEmail, the @auth slot will render the nested /reset/withEmail page ('reset') while maintaining the currently active page for the @nav slot ('login') since /reset/withEmail is only defined in @auth
    await browser.elementByCss('[href="/reset/withEmail"]').click()
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/login/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(
        /withEmail/
      )
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/^$/)
    })
  })

  it('hard nav to router page and soft nav to parallel route and soft nav back to another router page', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/^$/)
    })

    // when navigating to /reset, the @auth slot will render the /reset page ('reset') while maintaining the currently active page for the @nav slot ('null') since /reset is only defined in @auth
    await browser.elementByCss('[href="/reset"]').click()
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(/reset/)
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/^$/)
    })

    // when soft navigate to /foo, the @auth and @nav slot will maintain their the currently active states since they do not have /foo defined
    await browser.elementByCss('[href="/foo"]').click()
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(/reset/)
    })
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/foo/)
    })
  })

  it('hard nav to parallel route', async () => {
    const browser = await next.browser('/reset/withMobile')
    await retry(async () => {
      expect(await browser.elementById('navSegment').text()).toMatch(/^$/)
    })
    await retry(async () => {
      expect(await browser.elementById('authSegment').text()).toMatch(
        /withMobile/
      )
    })

    // the /app/default.tsx is rendered since /reset/withMobile is only defined in @auth
    await retry(async () => {
      expect(await browser.elementById('routeSegment').text()).toMatch(/^$/)
    })
  })
})
