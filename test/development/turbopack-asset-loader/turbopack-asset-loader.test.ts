import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('turbopack-asset-loader', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (!isTurbopack) {
    it('should only run the test in turbopack', () => {})
    return
  }

  it('should return static URL for SVG with ?url query', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const svgUrl = await browser
        .elementByCss('#svg-url')
        .getAttribute('data-url')
      expect(svgUrl).toMatch(/^\/_next\/static\/media\/icon\.[a-f0-9]+\.svg$/)
    })
  })

  it('should render the SVG as an image', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const imgSrc = await browser.elementByCss('img').getAttribute('src')
      expect(imgSrc).toMatch(/^\/_next\/static\/media\/icon\.[a-f0-9]+\.svg$/)
    })
  })
})
