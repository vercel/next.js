import { nextTestSetup, FileRef } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

describe('interception-route-prefetch-cache', () => {
  function runTests({ next }: ReturnType<typeof nextTestSetup>) {
    it('should render the correct interception when two distinct layouts share the same path structure', async () => {
      const browser = await next.browser('/')
      await browser.waitForIdleNetwork()

      await browser.elementByCss('[href="/foo"]').click()

      await retry(async () => {
        expect(await browser.elementById('children').text()).toMatch(/Foo Page/)
      })

      await browser.elementByCss('[href="/post/1"]').click()

      await retry(async () => {
        // Ensure the existing page content is still the same
        expect(await browser.elementById('children').text()).toMatch(/Foo Page/)

        // Verify we got the right interception
        expect(await browser.elementById('slot').text()).toMatch(
          /Intercepted on Foo Page/
        )
      })

      // Go back home. At this point, the router cache should have content from /foo
      // Now we want to ensure that /bar doesn't share that same prefetch cache entry
      await browser.elementByCss('[href="/"]').click()

      await browser.waitForElementByCss('#home')

      await browser.elementByCss('[href="/bar"]').click()

      await retry(async () => {
        expect(await browser.elementById('children').text()).toMatch(/Bar Page/)
      })

      await browser.elementByCss('[href="/post/1"]').click()

      // Ensure the existing page content is still the same. If the prefetch cache resolved the wrong cache node
      // then we'd see the content from /foo
      await retry(async () => {
        expect(await browser.elementById('children').text()).toMatch(/Bar Page/)
        expect(await browser.elementById('slot').text()).toMatch(
          /Intercepted on Bar Page/
        )
      })
    })
  }

  describe('runtime = nodejs', () => {
    runTests(
      nextTestSetup({
        files: __dirname,
      })
    )
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
