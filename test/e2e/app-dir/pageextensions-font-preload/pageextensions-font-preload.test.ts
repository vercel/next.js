import { nextTestSetup } from 'e2e-utils'

describe('pageextensions-font-preload', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })

  it('should apply font class from layout', async () => {
    const browser = await next.browser('/')
    const fontFamily = await browser.eval(
      'getComputedStyle(document.body).fontFamily'
    )
    expect(fontFamily).toMatch(/myFont/)
  })

  it('should preload font used in layout when pageExtensions contains dots', async () => {
    const browser = await next.browser('/')

    const fontPreloadLinks = await browser.elementsByCss('link[as="font"]')
    expect(fontPreloadLinks.length).toBeGreaterThan(0)

    const rel = await fontPreloadLinks[0].getAttribute('rel')
    const as = await fontPreloadLinks[0].getAttribute('as')
    const type = await fontPreloadLinks[0].getAttribute('type')
    const crossorigin = await fontPreloadLinks[0].getAttribute('crossorigin')

    expect(rel).toBe('preload')
    expect(as).toBe('font')
    expect(type).toBe('font/woff2')
    expect(crossorigin).toBe('')
  })
})
