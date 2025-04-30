import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

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
    const browser = await next.browser('/custom-icon')

    await retry(async () => {
      const iconsInBody = await browser.elementsByCss('body link[rel="icon"]')
      const iconsInHead = await browser.elementsByCss('head link[rel="icon"]')

      // moved to head
      expect(iconsInBody.length).toBe(0)
      // re-inserted favicon.ico + /heart.png
      expect(iconsInHead.length).toBe(2)
    })
  })

  it('should not contain icon insertion script when metadata is rendered in head', async () => {
    const iconInsertionScript = `document.querySelectorAll('body link[rel="icon"], body link[rel="apple-touch-icon"]').forEach(el => document.head.appendChild(el))`
    // Perform a blocking render to ensure the metadata is rendered in the head
    const blockingHtml = await next.render('/custom-icon', null, {
      headers: {
        'User-Agent': 'Discordbot',
      },
    })

    expect(blockingHtml).not.toContain(iconInsertionScript)

    const suspendedHtml = await next.render('/custom-icon')
    expect(suspendedHtml).toContain(iconInsertionScript)
  })

  it('should not contain icon replacement mark in html or after hydration', async () => {
    const html = await next.render('/custom-icon')
    expect(html).not.toContain('<meta name="«nxt-icon»" content=""/>')
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
})
