import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const pprEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('use-cache-private', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('excludes private caches from prerenders', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementById('page-sentinel').text()).toBe(
      isNextDev || !pprEnabled ? 'runtime' : 'buildtime'
    )

    expect(await browser.elementById('private-sentinel').text()).toBe('runtime')
  })

  it('allows reading cookies in private caches', async () => {
    const browser = await next.browser('/cookies')

    expect(await browser.elementById('test-cookie').text()).toBe('<empty>')

    await browser.addCookie({ name: 'test-cookie', value: 'foo' })
    await browser.refresh()

    expect(await browser.elementById('test-cookie').text()).toBe('foo')
  })

  it('allows reading search params in private caches', async () => {
    const browser = await next.browser('/search-params?q=foo')

    expect(await browser.elementById('search-param').text()).toBe('foo')

    await browser.loadPage(new URL('/search-params?q=bar', next.url).href)

    expect(await browser.elementById('search-param').text()).toBe('bar')
  })

  it('serves a stale entry on reload in dev and warms a fresh one in the background', async () => {
    const browser = await next.browser('/stale-while-revalidate')
    const initialValue = await browser.waitForElementByCss('#value').text()

    await browser.refresh()
    const reloadedValue = await browser.waitForElementByCss('#value').text()

    if (isNextDev) {
      // In dev the private entry is persisted and forced to `revalidate: 0`, so
      // it is always stale and served immediately on reload while a fresh entry
      // warms in the background.
      expect(reloadedValue).toBe(initialValue)

      // A subsequent reload reflects the freshly warmed value.
      await retry(async () => {
        await browser.refresh()
        const warmedValue = await browser.waitForElementByCss('#value').text()
        expect(warmedValue).not.toBe(initialValue)
      })
    } else {
      // In production private entries are not persisted, so every load re-runs
      // the cache and shows a fresh value.
      expect(reloadedValue).not.toBe(initialValue)
    }
  })

  it('keys persisted entries by cookies in dev', async () => {
    const browser = await next.browser('/stale-while-revalidate')

    await browser.addCookie({ name: 'use-cache-private-test', value: 'a' })
    await browser.refresh()
    const valueA = await browser.waitForElementByCss('#value').text()

    await browser.addCookie({ name: 'use-cache-private-test', value: 'b' })
    await browser.refresh()
    const valueB = await browser.waitForElementByCss('#value').text()

    // A different cookie produces a different private entry.
    expect(valueB).not.toBe(valueA)

    await browser.addCookie({ name: 'use-cache-private-test', value: 'a' })
    await browser.refresh()
    const valueA2 = await browser.waitForElementByCss('#value').text()

    if (isNextDev) {
      // Switching back to the original cookie hits its own persisted entry,
      // which proves the entry is keyed by the cookie (and not shared with the
      // other cookie's entry).
      expect(valueA2).toBe(valueA)
    } else {
      // Private entries are not persisted in production.
      expect(valueA2).not.toBe(valueA)
    }
  })

  it('keys persisted entries by headers in dev', async () => {
    const renderValue = async (headerValue: string) => {
      const $ = await next.render$('/stale-while-revalidate', undefined, {
        headers: { 'x-use-cache-private-test': headerValue },
      })
      return $('#value').text()
    }

    const valueA = await renderValue('a')
    const valueB = await renderValue('b')

    // A different header value produces a different private entry.
    expect(valueB).not.toBe(valueA)

    const valueA2 = await renderValue('a')

    if (isNextDev) {
      // Re-sending the original header value hits its own persisted entry, which
      // proves the entry is keyed by request headers (and not shared with the
      // other header value's entry).
      expect(valueA2).toBe(valueA)
    } else {
      // Private entries are not persisted in production.
      expect(valueA2).not.toBe(valueA)
    }
  })

  it('revalidates a persisted entry by tag in dev', async () => {
    if (!isNextDev) {
      // Private caches are only persisted in development, so tag revalidation
      // of a persisted private entry is a dev-only concern.
      return
    }

    const browser = await next.browser('/update-tag')
    expect(await browser.waitForElementByCss('#value').text()).toBe('initial')

    // The server action sets the value to 'updated' and revalidates the tag,
    // then triggers a refresh. That refresh's private read must already reflect
    // the new value: `updateTag` invalidated the persisted entry, so it is
    // regenerated rather than served stale (which would still show 'initial' on
    // this first read, only converging on a later one).
    await browser.elementById('update').click()

    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe('updated')
    })
  })
})
