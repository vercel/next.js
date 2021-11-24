/* eslint-env jest */
import { join } from 'path'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  File,
  initNextServerScript,
  renderViaHTTP,
  launchApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
let proxyPort
let proxyServer
const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))

const runTests = () => {
  it('should resolve index page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('index page')
  })

  it('should resolve products page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/products')
    expect(html).toContain('some products')
  })

  it('should resolve a dynamic page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/products/first')
    expect(html).toContain('a product')
  })

  it('should resolve a catch-all page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/catch-all/hello')
    expect(html).toContain('catch-all')
  })

  it('should proxy non-existent page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/non-existent')
    expect(html).toBe('/non-existent')
  })
}

describe('Trailing Slash Rewrite Proxying', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      proxyPort = await findPort()
      proxyServer = await initNextServerScript(
        join(appDir, 'server.js'),
        /ready on/i,
        {
          ...process.env,
          PORT: proxyPort,
        }
      )

      nextConfig.replace('__EXTERNAL_PORT__', proxyPort)

      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
      await killApp(proxyServer)
    })

    runTests()
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      proxyPort = await findPort()
      proxyServer = await initNextServerScript(
        join(appDir, 'server.js'),
        /ready on/i,
        {
          ...process.env,
          PORT: proxyPort,
        }
      )

      nextConfig.replace('__EXTERNAL_PORT__', proxyPort)

      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
      await killApp(proxyServer)
    })

    runTests()
  })
})
