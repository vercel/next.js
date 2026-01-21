import { nextTestSetup } from 'e2e-utils'

describe('mdx-font-preload', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/mdx': 'canary',
      '@mdx-js/loader': '^2.2.1',
      '@mdx-js/react': '^2.2.1',
    },
  })

  it('should render MDX page', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toBe('MDX Page')
    expect(await browser.elementByCss('p').text()).toBe(
      'This is an MDX page with font preloading.'
    )
  })

  it('should apply font class from layout', async () => {
    const browser = await next.browser('/')
    const fontFamily = await browser.eval(
      'getComputedStyle(document.body).fontFamily'
    )
    expect(fontFamily).toMatch(/myFont/)
  })

  it('should preload font from layout on MDX page', async () => {
    const browser = await next.browser('/')

    // Check for font preload link in DOM
    const fontPreloadLinks = await browser.elementsByCss('link[as="font"]')
    expect(fontPreloadLinks.length).toBeGreaterThan(0)

    // Verify the preload link attributes
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
