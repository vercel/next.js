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
    const iconsInBody = await browser.elementsByCss('body link[rel="icon"]')
    // favicon.ico + /heart.png
    expect(iconsInBody.length).toBe(2)

    const iconsInHead = await browser.elementsByCss('head link[rel="icon"]')
    // re-inserted favicon.ico + /heart.png
    expect(iconsInHead.length).toBe(2)
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
