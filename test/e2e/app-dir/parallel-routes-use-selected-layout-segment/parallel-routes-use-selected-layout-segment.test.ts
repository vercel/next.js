import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-use-selected-layout-segment', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('hard nav to router page and soft nav around other router pages', async () => {
    const browser = await next.browser('/')
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route):'
        )
      },
      30000,
      1000
    )

    await browser.elementByCss('[href="/foo"]').click()
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route): foo'
        )
      },
      30000,
      1000
    )
  })

  it('hard nav to router page and soft nav to parallel routes', async () => {
    const browser = await next.browser('/')
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route):'
        )
      },
      30000,
      1000
    )

    // soft nav to /login, since both @nav and @auth has /login defined, we expect both navSegment and authSegment to be 'login'
    await browser.elementByCss('[href="/login"]').click()
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route): login'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route): login'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route):'
        )
      },
      30000,
      1000
    )

    // when navigating to /reset, the @auth slot will render the /reset page ('reset') while maintaining the currently active page for the @nav slot ('login') since /reset is only defined in @auth
    await browser.elementByCss('[href="/reset"]').click()
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route): login'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route): reset'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route):'
        )
      },
      30000,
      1000
    )

    // when navigating to nested path /reset/withEmail, the @auth slot will render the nested /reset/withEmail page ('reset') while maintaining the currently active page for the @nav slot ('login') since /reset/withEmail is only defined in @auth
    await browser.elementByCss('[href="/reset/withEmail"]').click()
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route): login'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route): withEmail'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route):'
        )
      },
      30000,
      1000
    )
  })

  it('hard nav to router page and soft nav to parallel route and soft nav back to another router page', async () => {
    const browser = await next.browser('/')
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route):'
        )
      },
      30000,
      1000
    )

    // when navigating to /reset, the @auth slot will render the /reset page ('reset') while maintaining the currently active page for the @nav slot ('null') since /reset is only defined in @auth
    await browser.elementByCss('[href="/reset"]').click()
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route): reset'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route):'
        )
      },
      30000,
      1000
    )

    // when soft navigate to /foo, the @auth and @nav slot will maintain their the currently active states since they do not have /foo defined
    await browser.elementByCss('[href="/foo"]').click()
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route): reset'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route): foo'
        )
      },
      30000,
      1000
    )
  })

  it('hard nav to parallel route', async () => {
    const browser = await next.browser('/reset/withMobile')
    await retry(
      async () => {
        expect(await browser.elementById('navSegment').text()).toBe(
          'navSegment (parallel route):'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.elementById('authSegment').text()).toBe(
          'authSegment (parallel route): withMobile'
        )
      },
      30000,
      1000
    )

    // the /app/default.tsx is rendered since /reset/withMobile is only defined in @auth
    await retry(
      async () => {
        expect(await browser.elementById('routeSegment').text()).toBe(
          'routeSegment (app route):'
        )
      },
      30000,
      1000
    )
  })
})
