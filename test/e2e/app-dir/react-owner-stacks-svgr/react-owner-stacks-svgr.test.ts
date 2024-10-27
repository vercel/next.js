import { nextTestSetup } from 'e2e-utils'

describe('react-owner-stacks-svgr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: { dependencies: { '@svgr/webpack': '8.1.0' } },
  })

  it('renders an SVG that is transformed by @svgr/webpack into a React component', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('svg')).toBeDefined()
  })
})
