import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// internationalization.mdx#routing-overview: Proxy selects the locale and
// app/[lang] forwards it to the layout and page. Negotiation is fixture logic.
describe('documented App locale routing pattern', () => {
  const { next } = nextTestSetup({ files: __dirname })

  for (const [language, locale] of [
    ['nl-NL,nl;q=0.9,en-US;q=0.8', 'nl-NL'],
    ['nl,en;q=0.5', 'nl'],
    ['fr-FR,fr;q=0.9', 'en-US'],
  ]) {
    it(`redirects an unprefixed path to ${locale} while retaining the query`, async () => {
      const response = await next.fetch('/products?tag=one&tag=two', {
        headers: { 'accept-language': language },
        redirect: 'manual',
      })
      expect(response.status).toBe(307)
      const location = new URL(response.headers.get('location')!, next.url)
      expect(location.pathname).toBe(`/${locale}/products`)
      expect(location.searchParams.getAll('tag')).toEqual(['one', 'two'])
      const $ = await next.render$(location.pathname + location.search)
      expect($('html').attr('lang')).toBe(locale)
      expect($('#layout-language').text()).toBe(locale)
      expect($('#page-language').text()).toBe(locale)
      expect(JSON.parse($('#query').text())).toEqual({ tag: ['one', 'two'] })
    })
  }

  it('does not redirect an already localized URL for another Accept-Language', async () => {
    const response = await next.fetch('/nl/products', {
      headers: { 'accept-language': 'en-US' },
      redirect: 'manual',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    const $ = await next.render$('/nl/products')
    expect($('#layout-language').text()).toBe('nl')
    expect($('#page-language').text()).toBe('nl')
  })

  it('retains the locale and shared layout during client navigation and refresh', async () => {
    const browser = await next.browser('/nl-NL/products')
    expect(await browser.elementByCss('#layout-language').text()).toBe('nl-NL')
    await browser.eval('window.__routingLocaleMarker = "retained"')
    await browser.elementByCss('#details').click()
    await retry(async () => {
      expect(await browser.elementByCss('#detail-language').text()).toBe(
        'nl-NL'
      )
      expect(await browser.elementByCss('#layout-language').text()).toBe(
        'nl-NL'
      )
    })
    expect(new URL(await browser.url()).pathname).toBe(
      '/nl-NL/products/details'
    )
    expect(await browser.eval('window.__routingLocaleMarker')).toBe('retained')
    await browser.refresh()
    expect(await browser.elementByCss('#detail-language').text()).toBe('nl-NL')
    expect(await browser.elementByCss('#layout-language').text()).toBe('nl-NL')
  })
})
