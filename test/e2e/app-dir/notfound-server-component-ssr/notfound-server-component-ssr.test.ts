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
