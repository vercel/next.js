import { nextTestSetup } from 'e2e-utils'

describe('Image Component from node_modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply image config for node_modules', async () => {
    const browser = await next.browser('/')
    const src = await browser
      .elementById('image-from-node-modules')
      .getAttribute('src')
    expect(src).toMatch('i.imgur.com')

    const srcset = await browser
      .elementById('image-from-node-modules')
      .getAttribute('srcset')
    expect(srcset).toMatch('1234')
  })

  it('renders an external image during server-side rendering', async () => {
    const response = await next.fetch('/ssr')
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('id="ssr-image-from-node-modules"')
    expect(html).toContain('w=1234')
  })

  it('should warn when using images.domains config', async () => {
    expect(next.cliOutput).toContain(
      '`images.domains` is deprecated in favor of `images.remotePatterns`. Please update next.config.js to protect your application from malicious users.'
    )
  })
})
