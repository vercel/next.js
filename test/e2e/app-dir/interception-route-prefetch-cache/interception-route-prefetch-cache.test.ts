import { nextTestSetup, FileRef } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'
import { Response } from 'playwright'

describe('interception-route-prefetch-cache', () => {
  function runTests({ next }: ReturnType<typeof nextTestSetup>) {
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
  }

  describe('runtime = nodejs', () => {
    const testSetup = nextTestSetup({
      files: __dirname,
    })
    runTests(testSetup)

    const { next, isNextStart } = testSetup

    // this is a node runtime specific test as edge doesn't support static rendering
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
  })

  describe('runtime = edge', () => {
    runTests(
      nextTestSetup({
        files: {
          app: new FileRef(join(__dirname, 'app')),
          'app/layout.tsx': new FileRef(join(__dirname, 'app/layout-edge.tsx')),
        },
      })
    )
  })
})
