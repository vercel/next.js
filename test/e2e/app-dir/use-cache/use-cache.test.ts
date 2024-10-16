/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

const GENERIC_RSC_ERROR =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

describe('use-cache', () => {
  const { next, isNextDev, isNextDeploy, isNextStart, isTurbopack } =
    nextTestSetup({
      files: __dirname,
    })

  const itSkipTurbopack = isTurbopack ? it.skip : it

  // TODO: Fix the following error with Turbopack:
  // Error: Module [project]/app/client.tsx [app-client] (ecmascript) was
  // instantiated because it was required from module...
  itSkipTurbopack('should cache results', async () => {
    const browser = await next.browser('/?n=1')
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1a = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL('/?n=2', next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('2')
    const random2 = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL('/?n=1&unrelated', next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1b = await browser.waitForElementByCss('#y').text()

    // The two navigations to n=1 should use a cached value.
    expect(random1a).toBe(random1b)

    // The navigation to n=2 should be some other random value.
    expect(random1a).not.toBe(random2)

    // Client component should have rendered.
    expect(await browser.waitForElementByCss('#z').text()).toBe('foo')

    // Client component child should have rendered but not invalidated the cache.
    expect(await browser.waitForElementByCss('#r').text()).toContain('rnd')
  })

  it('should cache complex args', async () => {
    // Use two bytes that can't be encoded as UTF-8 to ensure serialization works.
    const browser = await next.browser('/complex-args?n=a1')
    const a1a = await browser.waitForElementByCss('#x').text()
    expect(a1a.slice(0, 2)).toBe('a1')

    await browser.loadPage(new URL('/complex-args?n=e2', next.url).toString())
    const e2a = await browser.waitForElementByCss('#x').text()
    expect(e2a.slice(0, 2)).toBe('e2')

    expect(a1a).not.toBe(e2a)

    await browser.loadPage(new URL('/complex-args?n=a1', next.url).toString())
    const a1b = await browser.waitForElementByCss('#x').text()
    expect(a1b.slice(0, 2)).toBe('a1')

    await browser.loadPage(new URL('/complex-args?n=e2', next.url).toString())
    const e2b = await browser.waitForElementByCss('#x').text()
    expect(e2b.slice(0, 2)).toBe('e2')

    // The two navigations to n=1 should use a cached value.
    expect(a1a).toBe(a1b)
    expect(e2a).toBe(e2b)
  })

  it('should dedupe with react cache inside "use cache"', async () => {
    const browser = await next.browser('/react-cache')
    const a = await browser.waitForElementByCss('#a').text()
    const b = await browser.waitForElementByCss('#b').text()
    // TODO: This is broken. It is expected to pass once we fix it.
    expect(a).not.toBe(b)
  })

  it('should error when cookies/headers/draftMode is used inside "use cache"', async () => {
    const browser = await next.browser('/errors')
    expect(await browser.waitForElementByCss('#cookies').text()).toContain(
      isNextDev
        ? 'Route /errors used "cookies" inside "use cache".'
        : GENERIC_RSC_ERROR
    )
    expect(await browser.waitForElementByCss('#headers').text()).toContain(
      isNextDev
        ? 'Route /errors used "headers" inside "use cache".'
        : GENERIC_RSC_ERROR
    )
    expect(await browser.waitForElementByCss('#draft-mode').text()).toContain(
      'Editing: false'
    )

    // CLI assertions are skipped in deploy mode because `next.cliOutput` will only contain build-time logs.
    if (!isNextDeploy) {
      expect(next.cliOutput).toContain(
        'Route /errors used "cookies" inside "use cache". '
      )
      expect(next.cliOutput).toContain(
        'Route /errors used "headers" inside "use cache". '
      )
    }
  })

  it('should cache results in route handlers', async () => {
    const response = await next.fetch('/api')
    const { rand1, rand2 } = await response.json()

    expect(rand1).toEqual(rand2)
  })

  if (isNextStart) {
    it('should match the expected revalidate config on the prerender manifest', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      expect(prerenderManifest.version).toBe(4)
      expect(
        prerenderManifest.routes['/cache-life'].initialRevalidateSeconds
      ).toBe(100)
    })

    it('should match the expected stale config in the page header', async () => {
      const meta = JSON.parse(
        await next.readFile('.next/server/app/cache-life.meta')
      )
      expect(meta.headers['x-nextjs-stale-time']).toBe('19')
    })

    it('should propagate unstable_cache tags correctly', async () => {
      const meta = JSON.parse(
        await next.readFile('.next/server/app/cache-tag.meta')
      )
      expect(meta.headers['x-next-cache-tags']).toContain('a,c,b')
    })
  }
})
