/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const sharedDeps = { 'get-port': '5.1.1' }

describe.each([
  { title: 'HTTP', useHttps: 'false' },
  { title: 'HTTPS', useHttps: 'true' },
])('Custom Server $title', ({ title, useHttps }) => {
  describe('with dynamic assetPrefix', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps },
      dependencies: sharedDeps,
    })

    it('should serve internal file from render', async () => {
      const html = await next.render('/static/hello.txt')
      expect(html).toMatch(/hello world/)
    })

    it('should handle render with undefined query', async () => {
      const html = await next.render('/no-query')
      expect(html).toMatch(/"query":/)
    })

    it('should set the assetPrefix dynamically', async () => {
      const normalUsage = await next.render('/asset')
      expect(normalUsage).not.toMatch(/127\.0\.0\.1/)

      const dynamicUsage = await next.render('/asset?setAssetPrefix=1')
      expect(dynamicUsage).toMatch(/127\.0\.0\.1/)
    })

    it('should handle null assetPrefix accordingly', async () => {
      const normalUsage = await next.render('/asset?setEmptyAssetPrefix=1')
      expect(normalUsage).toMatch(/"\/_next/)
    })

    it('should set the assetPrefix to a given request', async () => {
      for (let lc = 0; lc < 10; lc++) {
        const [normalUsage, dynamicUsage] = await Promise.all([
          next.render('/asset'),
          next.render('/asset?setAssetPrefix=1'),
        ])

        expect(normalUsage).not.toMatch(/127\.0\.0\.1/)
        expect(dynamicUsage).toMatch(/127\.0\.0\.1/)
      }
    })

    it('should render nested index', async () => {
      const html = await next.render('/dashboard')
      expect(html).toMatch(/made it to dashboard/)
    })

    it('should handle custom urls with requests handler', async () => {
      const html = await next.render('/custom-url-with-request-handler')
      expect(html).toMatch(/made it to dashboard/)
    })

    it.skip('should contain customServer in NEXT_DATA', async () => {
      const html = await next.render('/')
      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).customServer).toBe(true)
    })

    it.each(['/', '/no-query'])(
      'should handle compression for route %s',
      async (route) => {
        const response = await next.fetch(route)
        expect(response.headers.get('Content-Encoding')).toBe('gzip')
      }
    )

    it('should read the expected url protocol in middleware', async () => {
      const path = '/middleware-augmented'
      const response = await next.fetch(path)
      const port = new URL(next.url).port
      expect(response.headers.get('x-original-url')).toBe(
        `${useHttps === 'true' ? 'https' : 'http'}://localhost:${port}${path}`
      )
    })
  })
  ;(isNextDev ? describe.skip : describe)('with generateEtags enabled', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps, GENERATE_ETAGS: 'true' },
      dependencies: sharedDeps,
    })

    it('response includes etag header', async () => {
      const response = await next.fetch('/')
      expect(response.headers.get('etag')).toBeTruthy()
    })
  })

  describe('with generateEtags disabled', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps, GENERATE_ETAGS: 'false' },
      dependencies: sharedDeps,
    })

    it('response does not include etag header', async () => {
      const response = await next.fetch('/')
      expect(response.headers.get('etag')).toBeNull()
    })
  })

  if (useHttps === 'false') {
    ;(isNextDev ? describe : describe.skip)('HMR with custom server', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        startCommand: 'node server.js',
        serverReadyPattern: /- Local:/,
        env: { USE_HTTPS: useHttps },
        dependencies: sharedDeps,
      })

      it('Should support HMR when rendering with /index pathname', async () => {
        const browser = await next.browser('/test-index-hmr')
        const text = await browser.elementByCss('#go-asset').text()
        const logs = await browser.log()
        expect(text).toBe('Asset')

        expect(
          logs.some((log) =>
            log.message.includes(
              'ReactDOM.hydrate is no longer supported in React 18'
            )
          )
        ).toBe(false)

        const originalContent = await next.readFile('pages/index.js')
        await next.patchFile(
          'pages/index.js',
          originalContent.replace('Asset', 'Asset!!')
        )

        try {
          await retry(async () => {
            expect(await browser.elementByCss('#go-asset').text()).toMatch(
              /Asset!!/
            )
          })
        } finally {
          await next.patchFile('pages/index.js', originalContent)
        }
      })
    })
  }

  describe('Error when rendering without starting slash', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps },
      dependencies: sharedDeps,
    })

    it('should warn in development mode', async () => {
      const cliOutputBefore = next.cliOutput.length
      const html = await next.render('/no-slash')
      expect(html).toContain('made it to dashboard')
      await retry(async () => {
        expect(next.cliOutput.slice(cliOutputBefore)).toContain(
          'Cannot render page with path "dashboard"'
        )
      })
    })
    ;(isNextDev ? it.skip : it)('should warn in production mode', async () => {
      const cliOutputBefore = next.cliOutput.length
      const html = await next.render('/no-slash')
      expect(html).toContain('made it to dashboard')
      await retry(async () => {
        expect(next.cliOutput.slice(cliOutputBefore)).toContain(
          'Cannot render page with path "dashboard"'
        )
      })
    })
  })

  describe('with a custom fetch polyfill', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps, POLYFILL_FETCH: 'true' },
      dependencies: sharedDeps,
    })

    it('should serve internal file from render', async () => {
      const html = await next.render('/static/hello.txt')
      expect(html).toMatch(/hello world/)
    })
  })

  describe('unhandled rejection', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps },
      dependencies: sharedDeps,
    })

    it('stderr should include error message and stack trace', async () => {
      const cliOutputBefore = next.cliOutput.length
      await next.fetch('/unhandled-rejection')
      await retry(async () => {
        const newOutput = next.cliOutput.slice(cliOutputBefore)
        expect(newOutput).toContain('unhandledRejection')
      })
      const newOutput = next.cliOutput.slice(cliOutputBefore)
      expect(newOutput).toContain(
        'unhandledRejection: Error: unhandled rejection'
      )
      expect(newOutput).toMatch(/\/server\.js:\d+\d+/)
    })
  })

  describe('legacy NextCustomServer methods', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps },
      dependencies: sharedDeps,
    })

    it('NextCustomServer.renderToHTML', async () => {
      const rawHTML = await next.render('/legacy-methods/render-to-html?q=2')
      const $ = cheerio.load(rawHTML)
      const text = $('p').text()
      expect(text).toContain('made it to dynamic dashboard')
      expect(text).toContain('query param: 1')
    })

    it('NextCustomServer.render404', async () => {
      const html = await next.render('/legacy-methods/render404')
      expect(html).toContain('made it to 404')
    })

    it('NextCustomServer.renderError', async () => {
      const html = await next.render('/legacy-methods/render-error')
      if (isNextDev) {
        expect(html).toContain('Error: kaboom')
      } else {
        expect(html).toContain('made it to 500')
      }
    })

    it('NextCustomServer.renderErrorToHTML', async () => {
      const html = await next.render('/legacy-methods/render-error-to-html')
      if (isNextDev) {
        expect(html).toContain('Error: kaboom')
      } else {
        expect(html).toContain('made it to 500')
      }
    })
  })
})
