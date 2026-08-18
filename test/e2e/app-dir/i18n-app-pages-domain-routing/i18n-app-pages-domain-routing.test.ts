import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'

describe('i18n-app-pages-domain-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function fetchFromDomain(pathname: string, host = 'nl.example.local') {
    return next.fetch(pathname, {
      headers: { host },
    })
  }

  it('keeps Pages Router domain locale handling', async () => {
    const response = await fetchFromDomain('/')

    expect(response.status).toBe(200)
    expect(load(await response.text())('#pages-locale').text()).toBe('nl-NL')
  })

  it('routes a proxy locale rewrite to a dynamic App page', async () => {
    const response = await fetchFromDomain('/test')

    expect(response.status).toBe(200)
    expect(load(await response.text())('#app-locale').text()).toBe('nl-NL')
  })

  it('routes an explicit locale pathname to a dynamic App page', async () => {
    const response = await fetchFromDomain('/en-US/test', 'en.example.local')

    expect(response.status).toBe(200)
    expect(load(await response.text())('#app-locale').text()).toBe('en-US')
  })

  it('matches App catch-all params against the locale-prefixed pathname', async () => {
    const response = await fetchFromDomain('/nl-NL/blog/post')

    expect(response.status).toBe(200)
    const $ = load(await response.text())
    expect($('#app-locale').text()).toBe('nl-NL')
    expect($('#app-slug').text()).toBe('blog/post')
  })

  it('routes an explicit locale pathname to an exact App page', async () => {
    const response = await fetchFromDomain('/nl-NL/static')

    expect(response.status).toBe(200)
    expect(load(await response.text())('#static-app-locale').text()).toBe(
      'nl-NL'
    )
  })

  it('does not strip an explicit locale to match an unlocalized exact App page', async () => {
    const response = await fetchFromDomain(
      '/en-US/plain/static',
      'en.example.local'
    )

    expect(response.status).toBe(200)
    const $ = load(await response.text())
    expect($('#plain-static').length).toBe(0)
    expect($('#app-locale').text()).toBe('en-US')
    expect($('#app-slug').text()).toBe('plain/static')
  })

  it('does not expose an inferred domain locale to an unlocalized App route', async () => {
    const response = await fetchFromDomain('/plain/123')

    expect(response.status).toBe(200)
    expect(load(await response.text())('#plain-id').text()).toBe('123')
  })

  it('keeps locale normalization for dynamic Pages routes', async () => {
    const response = await fetchFromDomain('/nl-NL/product/widget')

    expect(response.status).toBe(200)
    expect(load(await response.text())('#product-locale').text()).toBe('nl-NL')
  })

  it('routes an explicit locale pathname to an App route handler', async () => {
    const response = await fetchFromDomain('/nl-NL/endpoint')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ locale: 'nl-NL' })
  })
})
