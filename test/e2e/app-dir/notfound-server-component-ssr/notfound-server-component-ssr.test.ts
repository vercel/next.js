import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('notfound-server-component-ssr', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('renders the home page normally', async () => {
    const $ = await next.render$('/')
    expect($('#home').text()).toBe('hello world')
  })

  it('server-renders the not-found content when notFound() is thrown in a Server Component', async () => {
    const res = await next.fetch('/trigger')
    expect(res.status).toBe(404)

    const html = await res.text()
    // The response must not be the empty client-only error shell.
    expect(html).not.toContain('__next_error__')

    const $ = cheerio.load(html)
    expect($('#layout-marker').text()).toBe('root-layout')
    expect($('#not-found-marker h1').text()).toBe('Custom Not Found')
    expect($('html').attr('lang')).toBe('en')
    expect(
      $('link[rel="stylesheet"]').filter((_: number, el: any) =>
        $(el).attr('href')?.includes('test.css')
      ).length
    ).toBeGreaterThan(0)
    expect($('meta[name="robots"]').attr('content')).toBe('noindex')
  })

  it('server-renders not-found content for a deeply nested Server Component', async () => {
    const res = await next.fetch('/nested/deep')
    expect(res.status).toBe(404)

    const html = await res.text()
    expect(html).not.toContain('__next_error__')

    const $ = cheerio.load(html)
    expect($('#layout-marker').text()).toBe('root-layout')
    expect($('#not-found-marker h1').text()).toBe('Custom Not Found')
  })

  it('matches the content of an actually unmatched URL', async () => {
    const triggerHtml = await (await next.fetch('/trigger')).text()
    const unmatchedHtml = await (
      await next.fetch('/this-route-does-not-exist-at-all')
    ).text()

    const $trigger = cheerio.load(triggerHtml)
    const $unmatched = cheerio.load(unmatchedHtml)

    expect($trigger('#not-found-marker').html()).toBe(
      $unmatched('#not-found-marker').html()
    )
    expect($trigger('#layout-marker').text()).toBe(
      $unmatched('#layout-marker').text()
    )
  })

  it('shows the not-found content with JavaScript disabled', async () => {
    const browser = await next.browser('/trigger', {
      disableJavaScript: true,
    })
    expect(await browser.elementByCss('#not-found-marker h1').text()).toBe(
      'Custom Not Found'
    )
    expect(await browser.elementByCss('#layout-marker').text()).toBe(
      'root-layout'
    )
  })

  it('hydrates cleanly with JavaScript enabled and no console errors', async () => {
    const browser = await next.browser('/trigger')
    expect(await browser.elementByCss('#not-found-marker h1').text()).toBe(
      'Custom Not Found'
    )

    const logs = await browser.log()
    const hydrationErrors = logs.filter(
      (log) => log.source === 'error' && /hydrat/i.test(log.message ?? '')
    )
    expect(hydrationErrors).toEqual([])
  })

  it('does not server-render the root not-found content when a nested not-found.js boundary exists', async () => {
    // /trigger has no nested not-found.js anywhere in its route, so it must
    // still be unaffected by the unrelated nested boundary under
    // /nested-boundary/[id] elsewhere in the app.
    const triggerRes = await next.fetch('/trigger')
    const triggerHtml = await triggerRes.text()
    expect(triggerHtml).not.toContain('__next_error__')
    expect(cheerio.load(triggerHtml)('#not-found-marker h1').text()).toBe(
      'Custom Not Found'
    )

    // /nested-boundary/missing has its own not-found.js, so which boundary
    // applies can't be determined from the error alone: this must fall back
    // to the original (safe) empty shell rather than risk rendering the
    // wrong (root) not-found content.
    const nestedRes = await next.fetch('/nested-boundary/missing')
    expect(nestedRes.status).toBe(404)
    const nestedHtml = await nestedRes.text()
    expect(nestedHtml).toContain('__next_error__')
    const $nested = cheerio.load(nestedHtml)
    expect($nested('#not-found-marker').length).toBe(0)
    expect($nested('#nested-not-found-marker').length).toBe(0)
  })

  it('still resolves to the correct nested not-found boundary once JavaScript runs', async () => {
    const browser = await next.browser('/nested-boundary/missing')
    expect(
      await browser.elementByCss('#nested-not-found-marker h1').text()
    ).toBe('Nested Not Found')
  })

  it('renders existing nested-boundary routes normally', async () => {
    const $ = await next.render$('/nested-boundary/123')
    expect($('#nested-boundary-page').text()).toBe('id: 123')
  })

  it('does not duplicate the root layout for a server action notFound()', async () => {
    const browser = await next.browser('/action')
    await browser.elementByCss('#trigger-action').click()

    await browser.waitForElementByCss('#not-found-marker')
    const layoutMarkers = await browser.elementsByCss('#layout-marker')
    expect(layoutMarkers.length).toBe(1)
  })

  if (!isNextDev) {
    it('bakes not-found content into the static output when notFound() is thrown during static generation', async () => {
      const res = await next.fetch('/posts/missing')
      expect(res.status).toBe(404)

      const html = await res.text()
      expect(html).not.toContain('__next_error__')

      const $ = cheerio.load(html)
      expect($('#layout-marker').text()).toBe('root-layout')
      expect($('#not-found-marker h1').text()).toBe('Custom Not Found')
    })

    it('still renders existing static params normally', async () => {
      const $ = await next.render$('/posts/exists')
      expect($('#post').text()).toBe('Post: exists')
    })
  }
})
