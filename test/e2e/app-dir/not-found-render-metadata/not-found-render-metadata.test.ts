import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'
import { gate, retry } from 'next-test-utils'

describe.each([
  {
    name: 'root layout',
    directory: '',
    title: 'Not-found boundary title | Site',
    paths: ['/', '/missing', '/missing/nested', '/static'],
    links: ['#missing'],
  },
  {
    name: 'root layout with a named slot',
    directory: '/fixtures/parallel-root',
    title: 'Parallel not-found title',
    paths: ['/', '/missing', '/missing/nested', '/static', '/slot-missing'],
    links: ['#missing', '#slot-missing'],
  },
])('not-found-render-metadata: $name', ({ directory, title, paths, links }) => {
  const { next } = nextTestSetup({ files: __dirname + directory })

  it.each(paths)('renders the boundary metadata for %s', async (path) => {
    const response = await next.fetch(path)
    const $ = load(await response.text())
    expect(response.status).toBe(404)
    expect(
      $('title')
        .map((_, el) => $(el).text())
        .get()
    ).toEqual([title])
    expect($('meta[name="description"]').attr('content')).toBe(
      'Not-found boundary description'
    )
    expect($('meta[property="og:title"]').attr('content')).toBe(
      'Not-found social title'
    )
    const browser = await next.browser(path)
    await retry(async () => {
      expect(await browser.eval('document.title')).toBe(title)
    })
    expect(await browser.elementsByCss('title')).toHaveLength(1)
    expect(await browser.elementByCss('h1').text()).toBe(
      'Not-found boundary UI'
    )
    expect(
      await browser.elementByCss('meta[name="robots"]').getAttribute('content')
    ).toBe('noindex')
  })

  it('preserves the known page metadata', async () => {
    const $ = await next.render$('/known')
    expect($('title').text()).toBe('Known page title | Site')
    const browser = await next.browser('/known')
    expect(await browser.eval('document.title')).toBe('Known page title | Site')
    expect(await browser.elementsByCss('meta[name="robots"]')).toHaveLength(0)
  })

  it.each(links)(
    'replaces metadata on client navigation through %s',
    async (link) => {
      const browser = await next.browser('/known')
      await browser.eval('window.notFoundNavigation = true')
      await browser.elementByCss(link).click()
      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe(
          'Not-found boundary UI'
        )
        expect(await browser.eval('document.title')).toBe(title)
      })
      expect(await browser.elementsByCss('title')).toHaveLength(1)
      expect(await browser.eval('window.notFoundNavigation')).toBe(true)
      await browser.elementByCss('#known').click()
      await retry(async () => {
        expect(await browser.eval('document.title')).toBe(
          'Known page title | Site'
        )
      })
      expect(await browser.elementsByCss('title')).toHaveLength(1)
      expect(await browser.eval('window.notFoundNavigation')).toBe(true)
    }
  )
})

describe('not-found metadata with a dynamic root layout', () => {
  const { next } = nextTestSetup({
    files: __dirname + '/fixtures/dynamic-root',
  })
  const title = 'en not found | Dynamic Site'

  it('preserves the root params and title template on initial navigation', async () => {
    const response = await next.fetch('/en/missing')
    const $ = load(await response.text())
    expect(response.status).toBe(404)
    expect(
      $('title')
        .map((_, el) => $(el).text())
        .get()
    ).toEqual([title])
    const browser = await next.browser('/en/missing')
    await retry(async () => {
      expect(await browser.eval('document.title')).toBe(title)
    })
    expect(await browser.elementsByCss('title')).toHaveLength(1)
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')
  })

  it('switches metadata during client navigation and restores the known page', async () => {
    // Legacy production recovers this dynamic-root fallback with an MPA
    // navigation. Metadata must be correct in both recovery modes.
    const staysInDocument = await gate((c) => c.dev || c.cacheComponents)
    const browser = await next.browser('/en/known')
    await browser.eval('window.notFoundNavigation = true')
    await browser.elementByCss('#missing').click()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe(
        'Dynamic not-found boundary'
      )
      expect(await browser.eval('document.title')).toBe(title)
    })
    expect(await browser.elementsByCss('title')).toHaveLength(1)
    expect(await browser.eval('window.notFoundNavigation')).toBe(
      staysInDocument ? true : undefined
    )
    await browser.elementByCss('#known').click()
    await retry(async () => {
      expect(await browser.eval('document.title')).toBe(
        'Known page | Dynamic Site'
      )
    })
    expect(await browser.elementsByCss('title')).toHaveLength(1)
    expect(await browser.eval('window.notFoundNavigation')).toBe(
      staysInDocument ? true : undefined
    )
  })
})
