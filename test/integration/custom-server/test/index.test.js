/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import getPort from 'get-port'
import clone from 'clone'
import {
  initNextServerScript,
  killApp,
  renderViaHTTP,
  fetchViaHTTP,
  check,
  File,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const indexPg = new File(join(appDir, 'pages/index.js'))

let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const context = {}

const startServer = async (optEnv = {}) => {
  const scriptPath = join(appDir, 'server.js')
  context.appPort = appPort = await getPort()
  const env = Object.assign(
    {},
    clone(process.env),
    { PORT: `${appPort}` },
    optEnv
  )

  server = await initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/
  )
}

describe('Custom Server', () => {
  describe('with dynamic assetPrefix', () => {
    beforeAll(() => startServer())
    afterAll(() => killApp(server))

    it('should serve internal file from render', async () => {
      const data = await renderViaHTTP(appPort, '/static/hello.txt')
      expect(data).toMatch(/hello world/)
    })

    it('should handle render with undefined query', async () => {
      expect(await renderViaHTTP(appPort, '/no-query')).toMatch(/"query":/)
    })

    it('should set the assetPrefix dynamically', async () => {
      const normalUsage = await renderViaHTTP(appPort, '/asset')
      expect(normalUsage).not.toMatch(/127\.0\.0\.1/)

      const dynamicUsage = await renderViaHTTP(
        appPort,
        '/asset?setAssetPrefix=1'
      )
      expect(dynamicUsage).toMatch(/127\.0\.0\.1/)
    })

    it('should handle null assetPrefix accordingly', async () => {
      const normalUsage = await renderViaHTTP(
        appPort,
        '/asset?setEmptyAssetPrefix=1'
      )
      expect(normalUsage).toMatch(/"\/_next/)
    })

    it('should set the assetPrefix to a given request', async () => {
      for (let lc = 0; lc < 1000; lc++) {
        const [normalUsage, dynamicUsage] = await Promise.all([
          await renderViaHTTP(appPort, '/asset'),
          await renderViaHTTP(appPort, '/asset?setAssetPrefix=1'),
        ])

        expect(normalUsage).not.toMatch(/127\.0\.0\.1/)
        expect(dynamicUsage).toMatch(/127\.0\.0\.1/)
      }
    })

    it('should render nested index', async () => {
      const html = await renderViaHTTP(appPort, '/dashboard')
      expect(html).toMatch(/made it to dashboard/)
    })
  })

  describe('with generateEtags enabled', () => {
    beforeAll(() => startServer({ GENERATE_ETAGS: 'true' }))
    afterAll(() => killApp(server))

    it('response includes etag header', async () => {
      const response = await fetchViaHTTP(appPort, '/')
      expect(response.headers.get('etag')).toBeTruthy()
    })
  })

  describe('with generateEtags disabled', () => {
    beforeAll(() => startServer({ GENERATE_ETAGS: 'false' }))
    afterAll(() => killApp(server))

    it('response does not include etag header', async () => {
      const response = await fetchViaHTTP(appPort, '/')
      expect(response.headers.get('etag')).toBeNull()
    })
  })

  describe('HMR with custom server', () => {
    beforeAll(() => startServer())
    afterAll(() => {
      killApp(server)
      indexPg.restore()
    })

    it('Should support HMR when rendering with /index pathname', async () => {
      let browser
      try {
        browser = await webdriver(context.appPort, '/test-index-hmr')
        const text = await browser.elementByCss('#go-asset').text()
        expect(text).toBe('Asset')

        indexPg.replace('Asset', 'Asset!!')

        await check(() => browser.elementByCss('#go-asset').text(), /Asset!!/)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
})
