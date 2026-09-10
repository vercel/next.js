/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { fetchViaRawHttp, renderViaRawHTTP, retry } from 'next-test-utils'
import cheerio from 'cheerio'

const sharedDeps = { 'get-port': '5.1.1' }
const sharedNodeEnv = isNextDev ? 'development' : 'production'
const deprecatedWarning = (method: string) =>
  `The \`app.${method}()\` method is deprecated in custom servers.`

describe.each([
  { title: 'HTTP', useHttps: 'false' },
  { title: 'HTTPS', useHttps: 'true' },
])('Custom Server $title', ({ title, useHttps }) => {
  // The HTTPS server presents a self-signed certificate that the test process
  // does not trust. Setting `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'`
  // does not take effect from inside the Jest VM context, so skip cert
  // verification per request instead.
  const tlsOpts =
    useHttps === 'true' ? { rejectUnauthorized: false } : undefined

  describe('with dynamic assetPrefix', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps, NODE_ENV: sharedNodeEnv },
      dependencies: sharedDeps,
      skipDeployment: true,
      disableAutoSkewProtection: true,
    })
    if (skipped) return

    it('should render the custom 404 page for an unmatched request', async () => {
      const response = await fetchViaRawHttp(
        next.url,
        '/does-not-exist',
        tlsOpts
      )

      expect(response.status).toBe(404)
      expect(await response.text()).toContain('made it to 404')
    })

    it('should serve internal file from render', async () => {
      const html = await renderViaRawHTTP(
        next.url,
        '/static/hello.txt',
        tlsOpts
      )
      expect(html).toMatch(/hello world/)
    })

    it('should handle render with undefined query', async () => {
      const html = await renderViaRawHTTP(next.url, '/no-query', tlsOpts)
      expect(html).toMatch(/"query":/)
    })

    it('should set the assetPrefix dynamically', async () => {
      const normalUsage = await renderViaRawHTTP(next.url, '/asset', tlsOpts)
      expect(normalUsage).not.toMatch(/127\.0\.0\.1/)

      const dynamicUsage = await renderViaRawHTTP(
        next.url,
        '/asset?setAssetPrefix=1',
        tlsOpts
      )
      expect(dynamicUsage).toMatch(/127\.0\.0\.1/)
      await retry(async () => {
        expect(next.cliOutput).toContain(deprecatedWarning('setAssetPrefix'))
      })
    })

    it('should handle null assetPrefix accordingly', async () => {
      const normalUsage = await renderViaRawHTTP(
        next.url,
        '/asset?setEmptyAssetPrefix=1',
        tlsOpts
      )
      expect(normalUsage).toMatch(/"\/_next/)
    })

    it('should set the assetPrefix to a given request', async () => {
      for (let lc = 0; lc < 10; lc++) {
        // Make requests sequential to avoid race condition with setAssetPrefix
        const normalUsage = await renderViaRawHTTP(next.url, '/asset', tlsOpts)
        const dynamicUsage = await renderViaRawHTTP(
          next.url,
          '/asset?setAssetPrefix=1',
          tlsOpts
        )

        expect(normalUsage).not.toMatch(/127\.0\.0\.1/)
        expect(dynamicUsage).toMatch(/127\.0\.0\.1/)
      }

      await retry(async () => {
        expect(
          next.cliOutput.split(deprecatedWarning('setAssetPrefix')).length - 1
        ).toBe(1)
      })
    })

    it('should render nested index', async () => {
      const html = await renderViaRawHTTP(next.url, '/dashboard', tlsOpts)
      expect(html).toMatch(/made it to dashboard/)
      await retry(async () => {
        expect(next.cliOutput).toContain(deprecatedWarning('render'))
      })
    })

    it('should warn once for repeated render calls', async () => {
      await renderViaRawHTTP(next.url, '/dashboard', tlsOpts)
      await renderViaRawHTTP(next.url, '/dashboard', tlsOpts)

      await retry(async () => {
        expect(
          next.cliOutput.split(deprecatedWarning('render')).length - 1
        ).toBe(1)
      })
    })

    it('should handle custom urls with requests handler', async () => {
      const html = await renderViaRawHTTP(
        next.url,
        '/custom-url-with-request-handler',
        tlsOpts
      )
      expect(html).toMatch(/made it to dashboard/)
    })

    it.skip('should contain customServer in NEXT_DATA', async () => {
      const html = await renderViaRawHTTP(next.url, '/', tlsOpts)
      const $ = cheerio.load(html)
      expect(JSON.parse($('#__NEXT_DATA__').text()).customServer).toBe(true)
    })

    it.each(['/', '/no-query'])(
      'should handle compression for route %s',
      async (route) => {
        const response = await fetchViaRawHttp(next.url, route, {
          ...tlsOpts,
          headers: { 'accept-encoding': 'gzip' },
        })
        expect(response.headers.get('Content-Encoding')).toBe('gzip')
      }
    )

    it('should read the expected url protocol in middleware', async () => {
      const path = '/middleware-augmented'
      const response = await fetchViaRawHttp(next.url, path, tlsOpts)
      const port = new URL(next.url).port
      expect(response.headers.get('x-original-url')).toBe(
        `${useHttps === 'true' ? 'https' : 'http'}://localhost:${port}${path}`
      )
    })
  })
  ;(isNextDev ? describe.skip : describe)('with generateEtags enabled', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: {
        USE_HTTPS: useHttps,
        GENERATE_ETAGS: 'true',
        NODE_ENV: sharedNodeEnv,
      },
      dependencies: sharedDeps,
      skipDeployment: true,
      disableAutoSkewProtection: true,
    })
    if (skipped) return

    it('response includes etag header', async () => {
      const response = await fetchViaRawHttp(next.url, '/', tlsOpts)
      expect(response.headers.get('etag')).toBeTruthy()
    })
  })

  describe('with generateEtags disabled', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: {
        USE_HTTPS: useHttps,
        GENERATE_ETAGS: 'false',
        NODE_ENV: sharedNodeEnv,
      },
      dependencies: sharedDeps,
      skipDeployment: true,
      disableAutoSkewProtection: true,
    })
    if (skipped) return

    it('response does not include etag header', async () => {
      const response = await fetchViaRawHttp(next.url, '/', tlsOpts)
      expect(response.headers.get('etag')).toBeNull()
    })
  })

  if (useHttps === 'false') {
    ;(isNextDev ? describe : describe.skip)('HMR with custom server', () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname,
        startCommand: 'node server.js',
        serverReadyPattern: /- Local:/,
        env: { USE_HTTPS: useHttps, NODE_ENV: sharedNodeEnv },
        dependencies: sharedDeps,
        skipDeployment: true,
        disableAutoSkewProtection: true,
      })
      if (skipped) return

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
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps, NODE_ENV: sharedNodeEnv },
      dependencies: sharedDeps,
      skipDeployment: true,
      disableAutoSkewProtection: true,
    })
    if (skipped) return
    ;(isNextDev ? it : it.skip)('should warn in development mode', async () => {
      const cliOutputBefore = next.cliOutput.length
      const html = await renderViaRawHTTP(next.url, '/no-slash', tlsOpts)
      expect(html).toContain('made it to dashboard')
      await retry(async () => {
        expect(next.cliOutput.slice(cliOutputBefore)).toContain(
          'Cannot render page with path "dashboard"'
        )
      })
    })
    ;(isNextDev ? it.skip : it)('should warn in production mode', async () => {
      const cliOutputBefore = next.cliOutput.length
      const html = await renderViaRawHTTP(next.url, '/no-slash', tlsOpts)
      expect(html).toContain('made it to dashboard')
      await retry(async () => {
        expect(next.cliOutput.slice(cliOutputBefore)).toContain(
          'Cannot render page with path "dashboard"'
        )
      })
    })
  })

  describe('with a custom fetch polyfill', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: {
        USE_HTTPS: useHttps,
        POLYFILL_FETCH: 'true',
        NODE_ENV: sharedNodeEnv,
      },
      dependencies: { ...sharedDeps, 'node-fetch': '2.6.7' },
      skipDeployment: true,
      disableAutoSkewProtection: true,
    })
    if (skipped) return

    it('should serve internal file from render', async () => {
      const html = await renderViaRawHTTP(
        next.url,
        '/static/hello.txt',
        tlsOpts
      )
      expect(html).toMatch(/hello world/)
    })
  })

  describe('unhandled rejection', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps, NODE_ENV: sharedNodeEnv },
      dependencies: sharedDeps,
      skipDeployment: true,
      disableAutoSkewProtection: true,
    })
    if (skipped) return

    it('stderr should include error message and stack trace', async () => {
      const cliOutputBefore = next.cliOutput.length
      await fetchViaRawHttp(next.url, '/unhandled-rejection', tlsOpts)
      await retry(async () => {
        const newOutput = next.cliOutput.slice(cliOutputBefore)
        expect(newOutput).toContain('unhandledRejection')
      })
      const newOutput = next.cliOutput.slice(cliOutputBefore)
      expect(newOutput).toContain(
        'unhandledRejection: Error: unhandled rejection'
      )
      expect(newOutput).toMatch(/server\.js:\d+:\d+/)
    })
  })

  describe('legacy NextCustomServer methods', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      startCommand: 'node server.js',
      serverReadyPattern: /- Local:/,
      env: { USE_HTTPS: useHttps, NODE_ENV: sharedNodeEnv },
      dependencies: sharedDeps,
      skipDeployment: true,
      disableAutoSkewProtection: true,
    })
    if (skipped) return

    it('NextCustomServer.renderToHTML', async () => {
      const rawHTML = await renderViaRawHTTP(
        next.url,
        '/legacy-methods/render-to-html?q=2',
        tlsOpts
      )
      const $ = cheerio.load(rawHTML)
      const text = $('p').text()
      expect(text).toContain('made it to dynamic dashboard')
      expect(text).toContain('query param: 1')
      await retry(async () => {
        expect(next.cliOutput).toContain(deprecatedWarning('renderToHTML'))
      })
    })

    it('NextCustomServer.render404', async () => {
      const html = await renderViaRawHTTP(
        next.url,
        '/legacy-methods/render404',
        tlsOpts
      )
      expect(html).toContain('made it to 404')
      await retry(async () => {
        expect(next.cliOutput).toContain(deprecatedWarning('render404'))
      })
    })

    it('NextCustomServer.renderError', async () => {
      const html = await renderViaRawHTTP(
        next.url,
        '/legacy-methods/render-error',
        tlsOpts
      )
      if (isNextDev) {
        expect(html).toContain('Error: kaboom')
      } else {
        expect(html).toContain('made it to 500')
      }
      await retry(async () => {
        expect(next.cliOutput).toContain(deprecatedWarning('renderError'))
      })
    })

    it('NextCustomServer.renderErrorToHTML', async () => {
      const html = await renderViaRawHTTP(
        next.url,
        '/legacy-methods/render-error-to-html',
        tlsOpts
      )
      if (isNextDev) {
        expect(html).toContain('Error: kaboom')
      } else {
        expect(html).toContain('made it to 500')
      }
      await retry(async () => {
        expect(next.cliOutput).toContain(deprecatedWarning('renderErrorToHTML'))
      })
    })

    it.each([
      ['logError', '/legacy-methods/log-error'],
      [
        'logErrorWithOriginalStack',
        '/legacy-methods/log-error-with-original-stack',
      ],
      ['revalidate', '/legacy-methods/revalidate'],
    ])('warns for NextCustomServer.%s', async (method, path) => {
      const response = await fetchViaRawHttp(next.url, path, tlsOpts)
      expect(response.status).toBe(200)
      await retry(async () => {
        expect(next.cliOutput).toContain(deprecatedWarning(method))
      })
    })
  })
})
