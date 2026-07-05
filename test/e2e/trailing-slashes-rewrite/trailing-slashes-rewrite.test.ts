import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, initNextServerScript, killApp } from 'next-test-utils'

describe('Trailing Slash Rewrite Proxying', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // Spawns a custom proxy server in front of `next.start()`; deploy mode
    // doesn't run a local server.
    skipDeployment: true,
  })
  if (skipped) return

  let proxyServer: any

  beforeAll(async () => {
    const proxyPort = await findPort()
    proxyServer = await initNextServerScript(
      join(__dirname, 'server.js'),
      /ready on/i,
      { ...process.env, PORT: String(proxyPort) }
    )

    next.env.EXTERNAL_PORT = String(proxyPort)

    if (!isNextDev) {
      await next.build()
    }
    await next.start()
  })

  afterAll(async () => {
    await killApp(proxyServer)
  })

  it('should resolve index page correctly', async () => {
    const html = await next.render('/')
    expect(html).toContain('index page')
  })

  it('should resolve products page correctly', async () => {
    const html = await next.render('/products')
    expect(html).toContain('some products')
  })

  it('should resolve a dynamic page correctly', async () => {
    const html = await next.render('/products/first')
    expect(html).toContain('a product')
  })

  it('should resolve a catch-all page correctly', async () => {
    const html = await next.render('/catch-all/hello')
    expect(html).toContain('catch-all')
  })

  it('should proxy non-existent page correctly', async () => {
    const html = await next.render('/non-existent')
    expect(html).toBe('/non-existent')
  })
})
