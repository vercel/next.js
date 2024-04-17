import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'parallel-routes-use-selected-layout-segment',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('hard nav to router page and soft nav around other router pages', async () => {
      const browser = await next.browser('/')
      await check(() => browser.elementById('navSegment').text(), /^$/)
      await check(() => browser.elementById('authSegment').text(), /^$/)
      await check(() => browser.elementById('routeSegment').text(), /^$/)

      await browser.elementByCss('[href="/foo"]').click()
      await check(() => browser.elementById('navSegment').text(), /^$/)
      await check(() => browser.elementById('authSegment').text(), /^$/)
      await check(() => browser.elementById('routeSegment').text(), /foo/)
    })

    it('hard nav to router page and soft nav to parallel routes', async () => {
      const browser = await next.browser('/')
      await check(() => browser.elementById('navSegment').text(), /^$/)
      await check(() => browser.elementById('authSegment').text(), /^$/)
      await check(() => browser.elementById('routeSegment').text(), /^$/)

      // soft nav to /login, since both @nav and @auth has /login defined, we expect both navSegment and authSegment to be 'login'
      await browser.elementByCss('[href="/login"]').click()
      await check(() => browser.elementById('navSegment').text(), /login/)
      await check(() => browser.elementById('authSegment').text(), /login/)
      await check(() => browser.elementById('routeSegment').text(), /^$/)

      // when navigating to /reset, the @auth slot will render the /reset page ('reset') while maintaining the currently active page for the @nav slot ('login') since /reset is only defined in @auth
      await browser.elementByCss('[href="/reset"]').click()
      await check(() => browser.elementById('navSegment').text(), /login/)
      await check(() => browser.elementById('authSegment').text(), /reset/)
      await check(() => browser.elementById('routeSegment').text(), /^$/)

      // when navigating to nested path /reset/withEmail, the @auth slot will render the nested /reset/withEmail page ('reset') while maintaining the currently active page for the @nav slot ('login') since /reset/withEmail is only defined in @auth
      await browser.elementByCss('[href="/reset/withEmail"]').click()
      await check(() => browser.elementById('navSegment').text(), /login/)
      await check(() => browser.elementById('authSegment').text(), /withEmail/)
      await check(() => browser.elementById('routeSegment').text(), /^$/)
    })

    it('hard nav to router page and soft nav to parallel route and soft nav back to another router page', async () => {
      const browser = await next.browser('/')
      await check(() => browser.elementById('navSegment').text(), /^$/)
      await check(() => browser.elementById('authSegment').text(), /^$/)
      await check(() => browser.elementById('routeSegment').text(), /^$/)

      // when navigating to /reset, the @auth slot will render the /reset page ('reset') while maintaining the currently active page for the @nav slot ('null') since /reset is only defined in @auth
      await browser.elementByCss('[href="/reset"]').click()
      await check(() => browser.elementById('navSegment').text(), /^$/)
      await check(() => browser.elementById('authSegment').text(), /reset/)
      await check(() => browser.elementById('routeSegment').text(), /^$/)

      // when soft navigate to /foo, the @auth and @nav slot will maintain their the currently active states since they do not have /foo defined
      await browser.elementByCss('[href="/foo"]').click()
      await check(() => browser.elementById('navSegment').text(), /^$/)
      await check(() => browser.elementById('authSegment').text(), /reset/)
      await check(() => browser.elementById('routeSegment').text(), /foo/)
    })

    it('hard nav to parallel route', async () => {
      const browser = await next.browser('/reset/withMobile')
      await check(() => browser.elementById('navSegment').text(), /^$/)
      await check(() => browser.elementById('authSegment').text(), /withMobile/)

      // the /app/default.tsx is rendered since /reset/withMobile is only defined in @auth
      await check(() => browser.elementById('routeSegment').text(), /^$/)
    })
  }
)
