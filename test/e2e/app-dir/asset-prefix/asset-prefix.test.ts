import { nextTestSetup } from 'e2e-utils'

describe('app-dir assetPrefix handling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should redirect route when requesting it directly', async () => {
    const res = await next.fetch('/a/', {
      redirect: 'manual',
    })
    expect(res.status).toBe(308)
    expect(new URL(res.headers.get('location'), next.url).pathname).toBe('/a')
  })

  it('should render link', async () => {
    const $ = await next.render$('/')
    expect($('#to-a-trailing-slash').attr('href')).toBe('/a')
  })

  it('should redirect route when requesting it directly by browser', async () => {
    const browser = await next.browser('/a')
    expect(await browser.waitForElementByCss('#a-page').text()).toBe('A page')
  })

  it('should redirect route when clicking link', async () => {
    const browser = await next.browser('/')
    await browser
      .elementByCss('#to-a-trailing-slash')
      .click()
      .waitForElementByCss('#a-page')
    expect(await browser.waitForElementByCss('#a-page').text()).toBe('A page')
  })

  it('bundles should return 200 on served assetPrefix', async () => {
    const $ = await next.render$('/')

    let bundles = []
    for (const script of $('script').toArray()) {
      const { src } = script.attribs
      if (src?.includes('/custom-asset-prefix/_next/static')) {
        bundles.push(src)
      }
    }

    expect(bundles.length).toBeGreaterThan(0)

    bundles.forEach(async (src) => {
      const { status } = await next.fetch(decodeURI(src))

      expect(status).toBe(200)
    })
  })

  describe('rewrites', () => {
    it('rewrites that do not start with assetPrefix should still work', async () => {
      const res = await next.fetch('/not-custom-asset-prefix/api/test-json', {})
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('{"message":"test"}')
    })

    it('should respect rewrites that start with assetPrefix', async () => {
      const res = await next.fetch('/custom-asset-prefix/api/test-json', {})
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('{"message":"test"}')
    })
  })
})
