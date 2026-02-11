import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('multiple-icons-same-name', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page without build errors', async () => {
    await retry(async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')
    })
  })

  it('should have icon link tags in head', async () => {
    const $ = await next.render$('/')
    // Webpack generates 1 icon link, Turbopack generates 2
    expect($('link[rel="icon"]').length).toBeGreaterThanOrEqual(1)
  })

  it('should serve both icon files without errors', async () => {
    const pngRes = await next.fetch('/icon.png')
    const svgRes = await next.fetch('/icon.svg')

    expect(pngRes.status).toBe(200)
    expect(svgRes.status).toBe(200)
  })
})
