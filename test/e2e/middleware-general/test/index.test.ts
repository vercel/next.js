/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, fetchViaHTTP, renderViaHTTP, waitFor } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import escapeStringRegexp from 'escape-string-regexp'

const middlewareWarning = 'using beta Middleware (not covered by semver)'
const urlsError = 'Please use only absolute URLs'

describe('Middleware Runtime', () => {
  let next: NextInstance
  let locale = ''

  afterAll(() => next.destroy())
  beforeAll(async () => {
    next = await createNext({
      files: {
        'next.config.js': new FileRef(join(__dirname, '../app/next.config.js')),
        'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
        pages: new FileRef(join(__dirname, '../app/pages')),
        'shared-package': new FileRef(
          join(__dirname, '../app/node_modules/shared-package')
        ),
      },
      packageJson: {
        scripts: {
          setup: `cp -r ./shared-package ./node_modules`,
          build: 'yarn setup && next build',
          dev: 'yarn setup && next dev',
          start: 'next start',
        },
      },
      startCommand: (global as any).isNextDev ? 'yarn dev' : 'yarn start',
      buildCommand: 'yarn build',
      env: {
        ANOTHER_MIDDLEWARE_TEST: 'asdf2',
        STRING_ENV_VAR: 'asdf3',
        MIDDLEWARE_TEST: 'asdf',
        NEXT_RUNTIME: 'edge',
      },
    })
  })

  if ((global as any).isNextDev) {
    it('should have showed warning for middleware usage', async () => {
      await renderViaHTTP(next.url, '/')
      await check(
        () => next.cliOutput,
        new RegExp(escapeStringRegexp(middlewareWarning))
      )
    })

    it('refreshes the page when middleware changes ', async () => {
      const browser = await webdriver(next.url, `/about`)
      await browser.eval('window.didrefresh = "hello"')
      const text = await browser.elementByCss('h1').text()
      expect(text).toEqual('AboutA')

      const middlewarePath = join(next.testDir, '/middleware.js')
      const originalContent = fs.readFileSync(middlewarePath, 'utf-8')
      const editedContent = originalContent.replace('/about/a', '/about/b')

      try {
        fs.writeFileSync(middlewarePath, editedContent)
        await waitFor(1000)
        const textb = await browser.elementByCss('h1').text()
        expect(await browser.eval('window.itdidnotrefresh')).not.toBe('hello')
        expect(textb).toEqual('AboutB')
      } finally {
        fs.writeFileSync(middlewarePath, originalContent)
        await browser.close()
      }
    })
  }

  if ((global as any).isNextStart) {
    it('should have valid middleware field in manifest', async () => {
      const manifest = await fs.readJSON(
        join(next.testDir, '.next/server/middleware-manifest.json')
      )
      expect(manifest.middleware).toEqual({
        '/': {
          env: ['MIDDLEWARE_TEST', 'ANOTHER_MIDDLEWARE_TEST', 'STRING_ENV_VAR'],
          files: ['server/edge-runtime-webpack.js', 'server/middleware.js'],
          name: 'middleware',
          page: '/',
          regexp: '^/.*$',
          wasm: [],
        },
      })
    })

    it('should have middleware warning during build', () => {
      expect(next.cliOutput).toContain(middlewareWarning)
    })

    it('should have middleware warning during start', () => {
      expect(next.cliOutput).toContain(middlewareWarning)
    })

    it('should have correct files in manifest', async () => {
      const manifest = await fs.readJSON(
        join(next.testDir, '.next/server/middleware-manifest.json')
      )
      for (const key of Object.keys(manifest.middleware)) {
        const middleware = manifest.middleware[key]
        expect(middleware.files).toContainEqual(
          expect.stringContaining('server/edge-runtime-webpack')
        )
        expect(middleware.files).not.toContainEqual(
          expect.stringContaining('static/chunks/')
        )
      }
    })
  }

  it('should redirect the same for direct visit and client-transition', async () => {
    const res = await fetchViaHTTP(
      next.url,
      `${locale}/redirect-1`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location'), 'http://n').pathname).toBe(
      '/somewhere/else'
    )

    const browser = await webdriver(next.url, `${locale}/`)
    await browser.eval(`next.router.push('/redirect-1')`)
    await check(async () => {
      const pathname = await browser.eval('location.pathname')
      return pathname === '/somewhere/else' ? 'success' : pathname
    }, 'success')
  })

  it('should rewrite the same for direct visit and client-transition', async () => {
    const res = await fetchViaHTTP(next.url, `${locale}/rewrite-1`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Hello World')

    const browser = await webdriver(next.url, `${locale}/`)
    await browser.eval('window.beforeNav = 1')
    await browser.eval(`next.router.push('/rewrite-1')`)
    await check(async () => {
      const content = await browser.eval('document.documentElement.innerHTML')
      return content.includes('Hello World') ? 'success' : content
    }, 'success')
    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should rewrite correctly for non-SSG/SSP page', async () => {
    const res = await fetchViaHTTP(next.url, `${locale}/rewrite-2`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('AboutA')

    const browser = await webdriver(next.url, `${locale}/`)
    await browser.eval(`next.router.push('/rewrite-2')`)
    await check(async () => {
      const content = await browser.eval('document.documentElement.innerHTML')
      return content.includes('AboutA') ? 'success' : content
    }, 'success')
  })

  it('should respond with 400 on decode failure', async () => {
    const res = await fetchViaHTTP(next.url, `${locale}/%2`)
    expect(res.status).toBe(400)

    if ((global as any).isNextStart) {
      expect(await res.text()).toContain('Bad Request')
    }
  })

  if (!(global as any).isNextDeploy) {
    // user agent differs on Vercel
    it('should set fetch user agent correctly', async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${locale}/fetch-user-agent-default`
      )

      expect(readMiddlewareJSON(res).headers['user-agent']).toBe(
        'Next.js Middleware'
      )

      const res2 = await fetchViaHTTP(
        next.url,
        `${locale}/fetch-user-agent-crypto`
      )
      expect(readMiddlewareJSON(res2).headers['user-agent']).toBe(
        'custom-agent'
      )
    })
  }

  it('should contain process polyfill', async () => {
    const res = await fetchViaHTTP(next.url, `/global`)
    expect(readMiddlewareJSON(res)).toEqual({
      process: {
        env: {
          ANOTHER_MIDDLEWARE_TEST: 'asdf2',
          STRING_ENV_VAR: 'asdf3',
          MIDDLEWARE_TEST: 'asdf',
          ...((global as any).isNextDeploy
            ? {}
            : {
                NEXT_RUNTIME: 'edge',
              }),
        },
      },
    })
  })

  it(`should contain \`globalThis\``, async () => {
    const res = await fetchViaHTTP(next.url, '/globalthis')
    expect(readMiddlewareJSON(res).length > 0).toBe(true)
  })

  it(`should contain crypto APIs`, async () => {
    const res = await fetchViaHTTP(next.url, '/webcrypto')
    expect('error' in readMiddlewareJSON(res)).toBe(false)
  })

  if (!(global as any).isNextDeploy) {
    it(`should accept a URL instance for fetch`, async () => {
      const response = await fetchViaHTTP(next.url, '/fetch-url')
      // TODO: why is an error expected here if it should work?
      const { error } = readMiddlewareJSON(response)
      expect(error).toBeTruthy()
      expect(error.message).not.toContain("Failed to construct 'URL'")
    })
  }

  it(`should allow to abort a fetch request`, async () => {
    const response = await fetchViaHTTP(next.url, '/abort-controller')
    const payload = readMiddlewareJSON(response)
    expect('error' in payload).toBe(true)
    expect(payload.error.name).toBe('AbortError')
    expect(payload.error.message).toBe('The operation was aborted')
  })

  it(`should validate & parse request url from any route`, async () => {
    const res = await fetchViaHTTP(next.url, `${locale}/static`)

    expect(res.headers.get('req-url-basepath')).toBeFalsy()
    expect(res.headers.get('req-url-pathname')).toBe('/static')

    const { pathname, params } = JSON.parse(res.headers.get('req-url-params'))
    expect(pathname).toBe(undefined)
    expect(params).toEqual(undefined)

    expect(res.headers.get('req-url-query')).not.toBe('bar')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale.slice(1))
    }
  })

  it(`should validate & parse request url from a dynamic route with params`, async () => {
    const res = await fetchViaHTTP(next.url, `/fr/1`)

    expect(res.headers.get('req-url-basepath')).toBeFalsy()
    expect(res.headers.get('req-url-pathname')).toBe('/1')

    const { pathname, params } = JSON.parse(res.headers.get('req-url-params'))
    expect(pathname).toBe('/:locale/:id')
    expect(params).toEqual({ locale: 'fr', id: '1' })

    expect(res.headers.get('req-url-query')).not.toBe('bar')
    expect(res.headers.get('req-url-locale')).toBe('fr')
  })

  it(`should validate & parse request url from a dynamic route with params and no query`, async () => {
    const res = await fetchViaHTTP(next.url, `/fr/abc123`)
    expect(res.headers.get('req-url-basepath')).toBeFalsy()

    const { pathname, params } = JSON.parse(res.headers.get('req-url-params'))
    expect(pathname).toBe('/:locale/:id')
    expect(params).toEqual({ locale: 'fr', id: 'abc123' })

    expect(res.headers.get('req-url-query')).not.toBe('bar')
    expect(res.headers.get('req-url-locale')).toBe('fr')
  })

  it(`should validate & parse request url from a dynamic route with params and query`, async () => {
    const res = await fetchViaHTTP(next.url, `/abc123?foo=bar`)
    expect(res.headers.get('req-url-basepath')).toBeFalsy()

    const { pathname, params } = JSON.parse(res.headers.get('req-url-params'))

    expect(pathname).toBe('/:id')
    expect(params).toEqual({ id: 'abc123' })

    expect(res.headers.get('req-url-query')).toBe('bar')
    expect(res.headers.get('req-url-locale')).toBe('en')
  })

  it('should throw when using URL with a relative URL', async () => {
    const res = await fetchViaHTTP(next.url, `/url/relative-url`)
    expect(readMiddlewareError(res)).toContain('Invalid URL')
  })

  it('should throw when using NextRequest with a relative URL', async () => {
    const response = await fetchViaHTTP(next.url, `/url/relative-next-request`)
    expect(readMiddlewareError(response)).toContain(urlsError)
  })

  if (!(global as any).isNextDeploy) {
    // these errors differ on Vercel
    it('should throw when using Request with a relative URL', async () => {
      const response = await fetchViaHTTP(next.url, `/url/relative-request`)
      expect(readMiddlewareError(response)).toContain(urlsError)
    })

    it('should warn when using Response.redirect with a relative URL', async () => {
      const response = await fetchViaHTTP(next.url, `/url/relative-redirect`)
      expect(readMiddlewareError(response)).toContain(urlsError)
    })
  }

  it('should warn when using NextResponse.redirect with a relative URL', async () => {
    const response = await fetchViaHTTP(next.url, `/url/relative-next-redirect`)
    expect(readMiddlewareError(response)).toContain(urlsError)
  })

  it('should throw when using NextResponse.rewrite with a relative URL', async () => {
    const response = await fetchViaHTTP(next.url, `/url/relative-next-rewrite`)
    expect(readMiddlewareError(response)).toContain(urlsError)
  })

  it('should trigger middleware for data requests', async () => {
    const browser = await webdriver(next.url, `/ssr-page`)
    const text = await browser.elementByCss('h1').text()
    expect(text).toEqual('Bye Cruel World')
    const res = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/en/ssr-page.json`
    )
    const json = await res.json()
    expect(json.pageProps.message).toEqual('Bye Cruel World')
  })

  it('should normalize data requests into page requests', async () => {
    const res = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/en/send-url.json`
    )
    expect(res.headers.get('req-url-path')).toEqual('/send-url')
  })

  it('should keep non data requests in their original shape', async () => {
    const res = await fetchViaHTTP(
      next.url,
      `/_next/static/${next.buildId}/_devMiddlewareManifest.json?foo=1`
    )
    expect(res.headers.get('req-url-path')).toEqual(
      `/_next/static/${next.buildId}/_devMiddlewareManifest.json?foo=1`
    )
  })

  it('should add a rewrite header on data requests for rewrites', async () => {
    const res = await fetchViaHTTP(next.url, `/ssr-page`)
    const dataRes = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/en/ssr-page.json`,
      undefined,
      { headers: { 'x-nextjs-data': '1' } }
    )
    const json = await dataRes.json()
    expect(json.pageProps.message).toEqual('Bye Cruel World')
    expect(res.headers.get('x-nextjs-matched-path')).toBeNull()
    expect(dataRes.headers.get('x-nextjs-matched-path')).toEqual(
      `/en/ssr-page-2`
    )
  })

  it(`hard-navigates when the data request failed`, async () => {
    const browser = await webdriver(next.url, `/error`)
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#throw-on-data').click()
    await browser.waitForElementByCss('.refreshed')
    expect(await browser.eval('window.__SAME_PAGE')).toBeUndefined()
  })
})

function readMiddlewareJSON(response) {
  return JSON.parse(response.headers.get('data'))
}

function readMiddlewareError(response) {
  return response.headers.get('error')
}
