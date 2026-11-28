import { nextTestSetup } from 'e2e-utils'

// The `turbopackModuleType` import attribute is Turbopack-specific; the fixture
// can't be built with webpack.
// @force-gate turbopack
describe('turbopack-module-type-attribute', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should import an SVG as a string with turbopackModuleType raw', async () => {
    const $ = await next.render$('/')
    expect($('#raw-svg').text()).toContain(
      'data-marker="module-type-svg-marker"'
    )
  })

  it('should keep the built-in image handling for imports without the attribute', async () => {
    const $ = await next.render$('/')
    expect(JSON.parse($('#image-svg').text())).toMatchObject({
      src: expect.stringContaining('.svg'),
      width: 24,
      height: 24,
    })
  })

  it('should import a file without a built-in rule with turbopackModuleType raw', async () => {
    const $ = await next.render$('/')
    expect($('#raw-txt').text()).toBe('Hello from turbopackModuleType raw\n')
  })
})
