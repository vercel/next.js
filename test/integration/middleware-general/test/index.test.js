/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const middlewareWarning = 'using beta Middleware (not covered by semver)'
const urlsError = 'Please use only absolute URLs'
const context = {
  appDir: join(__dirname, '../'),
  buildLogs: { output: '', stdout: '', stderr: '' },
  logs: { output: '', stdout: '', stderr: '' },
}

describe('Middleware Runtime', () => {
  describe('dev mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      context.dev = true
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        env: {
          MIDDLEWARE_TEST: 'asdf',
          NEXT_RUNTIME: 'edge',
        },
        onStdout(msg) {
          context.logs.output += msg
          context.logs.stdout += msg
        },
        onStderr(msg) {
          context.logs.output += msg
          context.logs.stderr += msg
        },
      })
    })

    tests(context)

    // This test has to be after something has been executed with middleware
    it('should have showed warning for middleware usage', () => {
      expect(context.logs.output).toContain(middlewareWarning)
    })

    it('refreshes the page when middleware changes ', async () => {
      const browser = await webdriver(context.appPort, `/about`)
      await browser.eval('window.didrefresh = "hello"')
      const text = await browser.elementByCss('h1').text()
      expect(text).toEqual('AboutA')

      const middlewarePath = join(context.appDir, '/middleware.js')
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
  })

  describe('production mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      const build = await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })

      context.buildLogs = {
        output: build.stdout + build.stderr,
        stderr: build.stderr,
        stdout: build.stdout,
      }
      context.dev = false

      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort, {
        env: {
          MIDDLEWARE_TEST: 'asdf',
          NEXT_RUNTIME: 'edge',
        },
        onStdout(msg) {
          context.logs.output += msg
          context.logs.stdout += msg
        },
        onStderr(msg) {
          context.logs.output += msg
          context.logs.stderr += msg
        },
      })
    })

    it('should have middleware warning during build', () => {
      expect(context.buildLogs.output).toContain(middlewareWarning)
    })

    it('should have middleware warning during start', () => {
      expect(context.logs.output).toContain(middlewareWarning)
    })

    it('should have correct files in manifest', async () => {
      const manifest = await fs.readJSON(
        join(context.appDir, '.next/server/middleware-manifest.json')
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

    tests(context)
  })
})

function tests(context, locale = '') {
  it('should respond with 400 on decode failure', async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/%2`)
    expect(res.status).toBe(400)

    if (!context.dev) {
      expect(await res.text()).toContain('Bad Request')
    }
  })

  it('should set fetch user agent correctly', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/fetch-user-agent-default`
    )
    expect(readMiddlewareJSON(res).headers['user-agent']).toBe(
      'Next.js Middleware'
    )

    const res2 = await fetchViaHTTP(
      context.appPort,
      `${locale}/fetch-user-agent-crypto`
    )
    expect(readMiddlewareJSON(res2).headers['user-agent']).toBe('custom-agent')
  })

  it('should contain process polyfill', async () => {
    const res = await fetchViaHTTP(context.appPort, `/global`)
    expect(readMiddlewareJSON(res)).toEqual({
      process: {
        env: {
          MIDDLEWARE_TEST: 'asdf',
          NEXT_RUNTIME: 'edge',
        },
      },
    })
  })

  it(`should contain \`globalThis\``, async () => {
    const res = await fetchViaHTTP(context.appPort, '/globalthis')
    expect(readMiddlewareJSON(res).length > 0).toBe(true)
  })

  it(`should contain crypto APIs`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/webcrypto')
    expect('error' in readMiddlewareJSON(res)).toBe(false)
  })

  it(`should accept a URL instance for fetch`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/fetch-url')
    const response = readMiddlewareJSON(res)
    expect(response).toHaveProperty('error.name')
    expect(response.error.name).not.toBe('TypeError')
  })

  it(`should allow to abort a fetch request`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/abort-controller')
    const response = readMiddlewareJSON(res)
    expect('error' in response).toBe(true)
    expect(response.error.name).toBe('AbortError')
    expect(response.error.message).toBe('The user aborted a request.')
  })

  it(`should validate & parse request url from any route`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/static`)
    expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/static')
    expect(res.headers.get('req-url-params')).not.toBe('{}')
    expect(res.headers.get('req-url-query')).not.toBe('bar')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale.slice(1))
    }
  })

  it(`should validate & parse request url from a dynamic route with params`, async () => {
    const res = await fetchViaHTTP(context.appPort, `/fr/1`)
    expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/1')
    expect(res.headers.get('req-url-params')).toBe('{"id":"1"}')
    expect(res.headers.get('req-url-page')).toBe('/[id]')
    expect(res.headers.get('req-url-query')).not.toBe('bar')
    expect(res.headers.get('req-url-locale')).toBe('fr')
  })

  it(`should validate & parse request url from a dynamic route with params and no query`, async () => {
    const res = await fetchViaHTTP(context.appPort, `/fr/abc123`)
    expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/abc123')
    expect(res.headers.get('req-url-params')).toBe('{"id":"abc123"}')
    expect(res.headers.get('req-url-page')).toBe('/[id]')
    expect(res.headers.get('req-url-query')).not.toBe('bar')
    expect(res.headers.get('req-url-locale')).toBe('fr')
  })

  it(`should validate & parse request url from a dynamic route with params and query`, async () => {
    const res = await fetchViaHTTP(context.appPort, `/abc123?foo=bar`)
    expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/abc123')
    expect(res.headers.get('req-url-params')).toBe('{"id":"abc123"}')
    expect(res.headers.get('req-url-page')).toBe('/[id]')
    expect(res.headers.get('req-url-query')).toBe('bar')
    expect(res.headers.get('req-url-locale')).toBe('en')
  })

  it('should throw when using URL with a relative URL', async () => {
    const res = await fetchViaHTTP(context.appPort, `/url/relative-url`)
    expect(readMiddlewareError(res)).toContain('Invalid URL')
  })

  it('should throw when using Request with a relative URL', async () => {
    const res = await fetchViaHTTP(context.appPort, `/url/relative-request`)
    expect(readMiddlewareError(res)).toContain('Invalid URL')
  })

  it('should throw when using NextRequest with a relative URL', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `/url/relative-next-request`
    )
    expect(readMiddlewareError(res)).toContain('Invalid URL')
  })

  it('should warn when using Response.redirect with a relative URL', async () => {
    const response = await fetchViaHTTP(
      context.appPort,
      `/url/relative-redirect`
    )
    expect(readMiddlewareError(response)).toContain(urlsError)
  })

  it('should warn when using NextResponse.redirect with a relative URL', async () => {
    const response = await fetchViaHTTP(
      context.appPort,
      `/url/relative-next-redirect`
    )
    expect(readMiddlewareError(response)).toContain(urlsError)
  })

  it('should throw when using NextResponse.rewrite with a relative URL', async () => {
    const response = await fetchViaHTTP(
      context.appPort,
      `/url/relative-next-rewrite`
    )
    expect(readMiddlewareError(response)).toContain(urlsError)
  })
}

function readMiddlewareJSON(response) {
  return JSON.parse(response.headers.get('data'))
}

function readMiddlewareError(response) {
  return response.headers.get('error')
}
