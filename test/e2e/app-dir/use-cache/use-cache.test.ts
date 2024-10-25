import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

const GENERIC_RSC_ERROR =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

describe('use-cache', () => {
  const { next, isNextDev, isNextDeploy, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should cache results', async () => {
    const browser = await next.browser(`/?n=1`)
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1a = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL(`/?n=2`, next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('2')
    const random2 = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL(`/?n=1&unrelated`, next.url).toString())
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

  if (!process.env.TURBOPACK_BUILD) {
    it('should cache results custom handler', async () => {
      const browser = await next.browser(`/custom-handler?n=1`)
      expect(await browser.waitForElementByCss('#x').text()).toBe('1')
      const random1a = await browser.waitForElementByCss('#y').text()

      await browser.loadPage(
        new URL(`/custom-handler?n=2`, next.url).toString()
      )
      expect(await browser.waitForElementByCss('#x').text()).toBe('2')
      const random2 = await browser.waitForElementByCss('#y').text()

      await browser.loadPage(
        new URL(`/custom-handler?n=1&unrelated`, next.url).toString()
      )
      expect(await browser.waitForElementByCss('#x').text()).toBe('1')
      const random1b = await browser.waitForElementByCss('#y').text()

      // The two navigations to n=1 should use a cached value.
      expect(random1a).toBe(random1b)

      // The navigation to n=2 should be some other random value.
      expect(random1a).not.toBe(random2)

      // Client component child should have rendered but not invalidated the cache.
      expect(await browser.waitForElementByCss('#r').text()).toContain('rnd')
    })
  }

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

  it('should cache results for cached funtions imported from client components', async () => {
    const browser = await next.browser('/imported-from-client')
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')
    await browser.elementById('submit-button').click()

    let threeRandomValues: string

    await retry(async () => {
      threeRandomValues = await browser.elementByCss('p').text()
      expect(threeRandomValues).toMatch(/\d\.\d+ \d\.\d+/)
    })

    await browser.elementById('reset-button').click()
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')

    await browser.elementById('submit-button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(threeRandomValues)
    })
  })

  it('should cache results for cached funtions passed client components', async () => {
    const browser = await next.browser('/passed-to-client')
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')
    await browser.elementById('submit-button').click()

    let threeRandomValues: string

    await retry(async () => {
      threeRandomValues = await browser.elementByCss('p').text()
      expect(threeRandomValues).toMatch(/\d\.\d+ \d\.\d+/)
    })

    await browser.elementById('reset-button').click()
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')

    await browser.elementById('submit-button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(threeRandomValues)
    })
  })

  // TODO: pending tags handling on deploy
  if (!isNextDeploy) {
    it('should update after revalidateTag correctly', async () => {
      const browser = await next.browser('/cache-tag')

      const initialX = await browser.elementByCss('#x').text()
      const initialY = await browser.elementByCss('#y').text()
      let updatedX
      let updatedY

      await browser.elementByCss('#revalidate-a').click()
      await retry(async () => {
        updatedX = await browser.elementByCss('#x').text()
        expect(updatedX).not.toBe(initialX)
      })

      await browser.elementByCss('#revalidate-b').click()
      await retry(async () => {
        updatedY = await browser.elementByCss('#y').text()
        expect(updatedY).not.toBe(initialY)
      })

      await browser.elementByCss('#revalidate-c').click()
      await retry(async () => {
        expect(await browser.elementByCss('#x').text()).not.toBe(updatedX)
        expect(await browser.elementByCss('#y').text()).not.toBe(updatedY)
      })
    })
  }

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

  it('can reference server actions in "use cache" functions', async () => {
    const browser = await next.browser('/with-server-action')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })

  it('should be able to revalidate a page using', async () => {
    const browser = await next.browser(`/form`)
    const time1 = await browser.waitForElementByCss('#t').text()

    await browser.loadPage(new URL(`/form`, next.url).toString())

    const time2 = await browser.waitForElementByCss('#t').text()

    expect(time1).toBe(time2)

    await browser.elementByCss('#refresh').click()

    await waitFor(500)

    const time3 = await browser.waitForElementByCss('#t').text()

    expect(time3).not.toBe(time2)

    // Reloading again should ideally be the same value but because the Action seeds
    // the cache with real params as the argument it has a different cache key.
    // await browser.loadPage(new URL(`/form?c`, next.url).toString())
    // const time4 = await browser.waitForElementByCss('#t').text()
    // expect(time4).toBe(time3);
  })

  it('should override fetch with no-store in use cache properly', async () => {
    const browser = await next.browser('/cache-fetch-no-store')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).toBe(initialValue)
  })
})
