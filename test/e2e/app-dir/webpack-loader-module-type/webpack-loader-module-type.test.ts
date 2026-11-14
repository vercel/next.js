import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-module-type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should load svg as asset/resource and return URL', async () => {
    const $ = await next.render$('/')
    const src = $('#svg-url').text()
    // asset/resource should emit the file and return URL path
    expect(src).toMatch(
      /\/_next\/static\/(immutable\/)?media\/test\.[0-9a-z_-]+\.svg$/
    )
  })

  it('should resolve asset URLs referenced from CSS', async () => {
    const browser = await next.browser('/')
    const backgroundImage = await browser
      .elementByCss('#css-url')
      .getComputedCss('background-image')
    const assetUrl = /url\("([^"]+)"\)/.exec(backgroundImage)?.[1]

    expect(assetUrl).toMatch(
      /\/_next\/static\/(immutable\/)?media\/test\.[0-9a-z_-]+\.svg$/
    )
    expect((await fetch(assetUrl!)).status).toBe(200)
  })

  // The bytes module type is not implemented in Webpack
  // @force-gate turbopack
  it('should load data file as bytes and return Uint8Array', async () => {
    const $ = await next.render$('/')
    const bytesType = $('#bytes-type').text()
    const bytesLength = $('#bytes-length').text()
    const bytesText = $('#bytes-text').text()

    expect(bytesType).toBe('Uint8Array')
    expect(bytesLength).toBe('11')
    expect(bytesText).toBe('hello world')
  })
})
