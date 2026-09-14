import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('pages router - prefetch with `as` pointing at an app route', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // `router.prefetch()` is a no-op in development, so the client router filter
  // marker is only ever written by production builds.
  ;(isNextDev ? describe.skip : describe)('production mode', () => {
    async function hoverLink(
      browser: Awaited<ReturnType<typeof next.browser>>,
      id: string
    ) {
      await browser.eval('window.beforeNav = 1')
      await browser.elementById(id).moveTo()

      // wait until the prefetch has consulted the client router filter and
      // stored its marker
      await retry(async () => {
        expect(
          await browser.eval(
            'Object.values(window.next.router.components).some((c) => c && c.__appRouter)'
          )
        ).toBe(true)
      })
    }

    it('should hard navigate to the app route when the link is clicked', async () => {
      const browser = await next.browser('/')
      await hoverLink(browser, 'app-link')

      await browser.elementById('app-link').click()
      await browser.waitForElementByCss('#app-page')

      expect(await browser.eval('window.beforeNav')).toBeUndefined()
      expect(await browser.eval('location.pathname')).toBe('/dashboard')
    })

    it('should keep shallow navigation working on the static pages route after prefetching the link', async () => {
      const browser = await next.browser('/')
      await hoverLink(browser, 'app-link')

      await browser.elementById('tab-b').click()
      await retry(async () => {
        expect(await browser.elementById('tab').text()).toBe('b')
      })

      // a hard navigation would have reset the flag
      expect(await browser.eval('window.beforeNav')).toBe(1)
      expect(await browser.eval('location.search')).toBe('?tab=b')
    })

    it('should keep shallow navigation working on the dynamic pages route after prefetching the link', async () => {
      const browser = await next.browser('/blog/first')
      await hoverLink(browser, 'app-link')

      await browser.elementById('tab-b').click()
      await retry(async () => {
        expect(await browser.elementById('tab').text()).toBe('b')
      })

      expect(await browser.eval('window.beforeNav')).toBe(1)
      expect(await browser.elementById('pages-page').text()).toBe(
        'hello from pages/blog/[slug]'
      )
      // the props from getServerSideProps must survive the shallow navigation
      expect(await browser.elementById('slug').text()).toBe('first')
      expect(await browser.elementById('tab-b').getAttribute('href')).toBe(
        '/blog/first?tab=b'
      )
    })

    it('should hard navigate when the href route was flagged by the prefetch and `as` differs', async () => {
      const browser = await next.browser('/')
      // `/modal` is a pages route and the static prefix of `app/modal/[id]`
      await hoverLink(browser, 'modal-link')

      // href is the flagged `/modal`, `as` is `/pretty` which the filter does
      // not know. This must fall back to a hard navigation instead of reading
      // the marker as component data.
      await browser.elementById('push-pretty').click()
      await browser.waitForElementByCss('#modal-page')

      expect(await browser.eval('window.beforeNav')).toBeUndefined()
      expect(await browser.eval('location.pathname')).toBe('/pretty')
    })
  })
})
