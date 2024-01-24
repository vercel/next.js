import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { Response } from 'playwright-chromium'

createNextDescribe(
  'interception-route-prefetch-cache',
  {
    files: __dirname,
  },
  ({ next, isNextStart }) => {
    it('should render the correct interception when two distinct layouts share the same path structure', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('[href="/foo"]').click()

      await check(() => browser.elementById('children').text(), /Foo Page/)

      await browser.elementByCss('[href="/post/1"]').click()

      // Ensure the existing page content is still the same
      await check(() => browser.elementById('children').text(), /Foo Page/)

      // Verify we got the right interception
      await check(
        () => browser.elementById('slot').text(),
        /Intercepted on Foo Page/
      )

      // Go back home. At this point, the router cache should have content from /foo
      // Now we want to ensure that /bar doesn't share that same prefetch cache entry
      await browser.elementByCss('[href="/"]').click()
      await browser.elementByCss('[href="/bar"]').click()

      await check(() => browser.elementById('children').text(), /Bar Page/)
      await browser.elementByCss('[href="/post/1"]').click()

      // Ensure the existing page content is still the same. If the prefetch cache resolved the wrong cache node
      // then we'd see the content from /foo
      await check(() => browser.elementById('children').text(), /Bar Page/)
      await check(
        () => browser.elementById('slot').text(),
        /Intercepted on Bar Page/
      )
    })

    if (isNextStart) {
      it('should not be a cache HIT when prefetching an interception route', async () => {
        const responses: { cacheStatus: string; pathname: string }[] = []
        const browser = await next.browser('/baz', {
          beforePageLoad(page) {
            page.on('response', (response: Response) => {
              const url = new URL(response.url())
              const request = response.request()
              const responseHeaders = response.headers()
              const requestHeaders = request.headers()
              if (requestHeaders['next-router-prefetch']) {
                responses.push({
                  cacheStatus: responseHeaders['x-nextjs-cache'],
                  pathname: url.pathname,
                })
              }
            })
          },
        })

        expect(await browser.elementByCss('body').text()).toContain(
          'Open Interception Modal'
        )

        const interceptionPrefetchResponse = responses.find(
          (response) => response.pathname === '/baz/modal'
        )
        const homePrefetchResponse = responses.find(
          (response) => response.pathname === '/'
        )

        expect(homePrefetchResponse.cacheStatus).toBe('HIT') // sanity check to ensure we're seeing cache statuses
        expect(interceptionPrefetchResponse.cacheStatus).toBeUndefined()
      })
    }
  }
)
