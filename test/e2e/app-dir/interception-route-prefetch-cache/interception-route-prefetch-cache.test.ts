import { nextTestSetup, FileRef } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

function readRootPayload(flight: string) {
  const root = flight.split('\n').find((line) => line.startsWith('0:'))
  expect(root).toBeDefined()
  return JSON.parse(root.slice(2))
}

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

  function runPayloadTests(
    { next, isNextDev }: ReturnType<typeof nextTestSetup>,
    { reportsInterception }: { reportsInterception: boolean }
  ) {
    it.each([
      { pathname: '/post/1', interceptable: true },
      { pathname: '/foo', interceptable: false },
    ])(
      'should report interception capability in Flight for $pathname',
      async ({ pathname, interceptable }) => {
        const res = await next.fetch(pathname, { headers: { RSC: '1' } })
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('text/x-component')
        expect(readRootPayload(await res.text()).i).toBe(
          isNextDev || (reportsInterception && interceptable)
        )
      }
    )

    it('should report interception capability in the initial HTML payload', async () => {
      const $ = await next.render$('/post/1')
      let flight = ''
      for (const el of $('script').toArray()) {
        const script = $(el).text()
        const prefix = 'self.__next_f.push('
        if (script.startsWith(prefix)) {
          const chunk = JSON.parse(script.slice(prefix.length, -1))
          if (chunk[0] === 1) flight += chunk[1]
        }
      }
      expect(readRootPayload(flight).i).toBe(isNextDev || reportsInterception)
    })
  }

  describe('runtime = nodejs', () => {
    const setup = nextTestSetup({
      files: __dirname,
    })
    runTests(setup)
    runPayloadTests(setup, { reportsInterception: true })
  })

  describe('runtime = edge', () => {
    const setup = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        'app/layout.tsx': new FileRef(join(__dirname, 'app/layout-edge.tsx')),
      },
    })
    runTests(setup)
    // TODO: Edge renders don't report interception capability yet, even though
    // the response's Vary header includes Next-URL.
    runPayloadTests(setup, { reportsInterception: false })
  })
})
