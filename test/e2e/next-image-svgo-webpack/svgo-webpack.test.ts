import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('svgo-webpack loader', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@svgr/webpack': '8.1.0',
    },
  })

  it('should render an SVG that is transformed by @svgr/webpack into a React component (pages router)', async () => {
    const browser = await next.browser('/pages')
    expect(await browser.elementByCss('svg')).toBeDefined()
  })

  it('should render an SVG that is transformed by @svgr/webpack into a React component (app router)', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('svg')).toBeDefined()
  })
})
