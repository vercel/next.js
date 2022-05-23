/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import getPort from 'get-port'
import cheerio from 'cheerio'
import {
  initNextServerScript,
  killApp,
  renderViaHTTP,
  fetchViaHTTP,
  check,
  File,
  nextBuild,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const indexPg = new File(join(appDir, 'pages/index.js'))

let appPort
let server

const context = {}

const startServer = async (optEnv = {}, opts) => {
  const scriptPath = join(appDir, 'server.js')
  context.appPort = appPort = await getPort()
  const env = Object.assign(
    { ...process.env },
    { PORT: `${appPort}`, __NEXT_TEST_MODE: 'true' },
    optEnv
  )

  server = await initNextServerScript(
    scriptPath,
    /ready on/i,
    env,
    /ReferenceError: options is not defined/,
    opts
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

    it('should contain customServer in NEXT_DATA', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).customServer).toBe(true)
    })
  })

  describe('with generateEtags enabled', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      await startServer({ GENERATE_ETAGS: 'true', NODE_ENV: 'production' })
    })
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
        const logs = await browser.log()
        expect(text).toBe('Asset')

        // Hydrates with react 18 is correct as expected
        expect(
          logs.some((log) =>
            log.message.includes(
              'ReactDOM.hydrate is no longer supported in React 18'
            )
          )
        ).toBe(false)

        indexPg.replace('Asset', 'Asset!!')

        await check(() => browser.elementByCss('#go-asset').text(), /Asset!!/)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('Error when rendering without starting slash', () => {
    afterEach(() => killApp(server))

    it('should warn in dev mode', async () => {
      let stderr = ''
      await startServer(
        {},
        {
          onStderr(msg) {
            stderr += msg || ''
          },
        }
      )
      const html = await renderViaHTTP(appPort, '/no-slash')
      expect(html).toContain('made it to dashboard')
      expect(stderr).toContain('Cannot render page with path "dashboard"')
    })

    it('should warn in production mode', async () => {
      const { code } = await nextBuild(appDir)
      expect(code).toBe(0)

      let stderr = ''

      await startServer(
        { NODE_ENV: 'production' },
        {
          onStderr(msg) {
            stderr += msg || ''
          },
        }
      )

      const html = await renderViaHTTP(appPort, '/no-slash')
      expect(html).toContain('made it to dashboard')
      expect(stderr).toContain('Cannot render page with path "dashboard"')
    })
  })

  describe('compression handling', function () {
    beforeAll(() => startServer())
    afterAll(() => killApp(server))

    it.each(['/', '/no-query'])(
      'should handle compression for route %s',
      async (route) => {
        const response = await fetchViaHTTP(appPort, route)
        expect(response.headers.get('Content-Encoding')).toBe('gzip')
      }
    )
  })

  describe('with a custom fetch polyfill', () => {
    beforeAll(() => startServer({ POLYFILL_FETCH: 'true' }))
    afterAll(() => killApp(server))

    it('should serve internal file from render', async () => {
      const data = await renderViaHTTP(appPort, '/static/hello.txt')
      expect(data).toMatch(/hello world/)
    })
  })

  describe('unhandled rejection', () => {
    afterEach(() => killApp(server))

    it('stderr should include error message and stack trace', async () => {
      let stderr = ''
      await startServer(
        {},
        {
          onStderr(msg) {
            stderr += msg || ''
          },
        }
      )
      await fetchViaHTTP(appPort, '/unhandled-rejection')
      await check(() => stderr, /unhandledRejection/)
      expect(stderr).toContain(
        'error - unhandledRejection: Error: unhandled rejection'
      )
      expect(stderr).toContain('server.js:22:22')
    })
  })
})
