import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'

const iconInsertionScript = `document.querySelectorAll('body link[rel="icon"], body link[rel="apple-touch-icon"]').forEach(el => document.head.appendChild(el))`

describe('app-dir - metadata-icons', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only have 1 favicon link in root page', async () => {
    const $ = await next.render$('/')
    expect($('link[href^="/favicon.ico"]').length).toBe(1)
  })

  it('should only have 1 favicon link in nested page', async () => {
    const $ = await next.render$('/nested')
    expect($('link[href^="/favicon.ico"]').length).toBe(1)
  })

  it('should render custom icons along with favicon in root page', async () => {
    const $ = await next.render$('/')
    expect($('link[rel="shortcut icon"]').attr('href')).toBe(
      '/shortcut-icon.png'
    )
  })

  it('should render custom icons along with favicon in nested page', async () => {
    const $ = await next.render$('/nested')
    expect($('link[rel="shortcut icon"]').attr('href')).toBe(
      '/shortcut-icon-nested.png'
    )
  })

  it('should re-insert the body icons into the head', async () => {
    const strictCsp = await gate((c) => c.externalBrowserRuntime && !c.dev)
    const { browser, response } = await next.browserWithResponse('/custom-icon')
    expect(response.headers()['content-security-policy']).toBe(
      strictCsp ? "script-src 'self' https://vercel.live" : undefined
    )

    await retry(async () => {
      const iconsInBody = await browser.elementsByCss('body link[rel="icon"]')
      const iconsInHead = await browser.elementsByCss('head link[rel="icon"]')

      expect(iconsInBody.length).toBe(0)
      expect(iconsInHead.length).toBe(2)
    })
  })

  it('should emit an icon relocation instruction for streamed metadata', async () => {
    const suspendedHtml = await next.render('/custom-icon')
    if (await gate((c) => c.externalBrowserRuntime)) {
      expect(suspendedHtml).toContain('<template data-next-icon></template>')
      expect(suspendedHtml).not.toContain(iconInsertionScript)
    } else {
      expect(suspendedHtml).toContain(iconInsertionScript)
    }
  })

  it('should not contain icon replacement mark in html or after hydration', async () => {
    const html = await next.render('/custom-icon')
    expect(html).not.toContain('<meta name="«nxt-icon»">')
    expect(html).not.toContain('«nxt-icon»')

    const browser = await next.browser('/custom-icon')
    const metaTags = await browser.elementsByCss('meta')
    // none of them has [name="«nxt-icon»"]
    const names = await Promise.all(
      metaTags.map((el) => el.getAttribute('name'))
    )
    expect(names).not.toContain('«nxt-icon»')
  })

  it('should re-insert the apple icons into the head after navigation', async () => {
    const browser = await next.browser('/custom-icon')
    await browser.elementByCss('#custom-icon-sub-link').click()

    await retry(async () => {
      const url = await browser.url()
      expect(url).toMatch(/\/custom-icon\/sub$/)
    })

    await retry(async () => {
      const iconsInHead = await browser.elementsByCss('head link[rel="icon"]')
      let iconUrls = await Promise.all(
        iconsInHead.map(
          async (el) => (await el.getAttribute('href')).split('?')[0]
        )
      )
      // Pick last 2 icons
      // In non-headless mode, the icons are deduped;
      // In headless mode, the icons are not deduped
      expect(iconUrls.length === 4 ? iconUrls.slice(2) : iconUrls).toEqual([
        '/favicon.ico',
        '/star.png',
      ])
    })

    // navigate back
    await browser.elementByCss('#custom-icon-link').click()
    await retry(async () => {
      const url = await browser.url()
      expect(url).toMatch(/\/custom-icon$/)
    })

    await retry(async () => {
      const icons = await browser.elementsByCss('head link[rel="icon"]')
      const iconUrls = await Promise.all(
        icons.map(async (el) => (await el.getAttribute('href')).split('?')[0])
      )

      // Pick last 2 icons
      // In non-headless mode, the icons are deduped;
      // In headless mode, the icons are not deduped
      expect(iconUrls.length === 4 ? iconUrls.slice(2) : iconUrls).toEqual([
        '/favicon.ico',
        '/heart.png',
      ])
    })
  })

  it('should re-insert the icons into head when icons are inserted in body during initial chunk', async () => {
    const $ = await next.render$('/custom-icon/delay-icons')
    expect($('meta[name="«nxt-icon»"]').length).toBe(0)

    // The relocation instruction follows the icons in the body.
    const body = $('body')
    const icons = body.find('link[rel="icon"]')
    expect(icons.length).toBe(2)
    expect(Array.from(icons.map((_, el) => $(el).attr('href')))).toContain(
      '/heart.png'
    )

    const bodyHtml = body.html()
    if (await gate((c) => c.externalBrowserRuntime)) {
      expect(bodyHtml).toContain('<template data-next-icon></template>')
      expect(bodyHtml).not.toContain(iconInsertionScript)
    } else {
      expect(bodyHtml).toContain(iconInsertionScript)
    }

    const strictCsp = await gate((c) => c.externalBrowserRuntime && !c.dev)
    const { browser, response } = await next.browserWithResponse(
      '/custom-icon/delay-icons'
    )
    expect(response.headers()['content-security-policy']).toBe(
      strictCsp ? "script-src 'self' https://vercel.live" : undefined
    )
    await retry(async () => {
      expect(await browser.elementsByCss('body link[rel="icon"]')).toHaveLength(
        0
      )
      const iconsInHead = await browser.elementsByCss('head link[rel="icon"]')
      const iconUrls = await Promise.all(
        iconsInHead.map(
          async (el) => (await el.getAttribute('href')).split('?')[0]
        )
      )
      expect(iconUrls).toEqual(['/favicon.ico', '/heart.png'])
    })
  })
})
