import { nextTestSetup } from 'e2e-utils'

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
})
