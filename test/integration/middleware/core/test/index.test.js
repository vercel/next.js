/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  check,
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const context = {}
context.appDir = join(__dirname, '../')

const middlewareWarning = 'using beta Middleware (not covered by semver)'
const urlsError = 'Please use only absolute URLs'

describe('Middleware base tests', () => {
  describe('dev mode', () => {
    const log = { output: '' }

    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        onStdout(msg) {
          log.output += msg
        },
        onStderr(msg) {
          log.output += msg
        },
      })
    })
    afterAll(() => killApp(context.app))
    rewriteTests(log)
    rewriteTests(log, '/fr')
    redirectTests()
    redirectTests('/fr')
    responseTests()
    responseTests('/fr')
    interfaceTests()
    interfaceTests('/fr')
    urlTests(log)
    urlTests(log, '/fr')
    errorTests()
    errorTests('/fr')

    it('should have showed warning for middleware usage', () => {
      expect(log.output).toContain(middlewareWarning)
    })
  })
  describe('production mode', () => {
    let serverOutput = { output: '' }
    let buildOutput

    beforeAll(async () => {
      const res = await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })
      buildOutput = res.stdout + res.stderr

      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort, {
        onStdout(msg) {
          serverOutput.output += msg
        },
        onStderr(msg) {
          serverOutput.output += msg
        },
      })
    })
    afterAll(() => killApp(context.app))
    rewriteTests(serverOutput)
    rewriteTests(serverOutput, '/fr')
    redirectTests()
    redirectTests('/fr')
    responseTests()
    responseTests('/fr')
    interfaceTests()
    interfaceTests('/fr')
    urlTests(serverOutput)
    urlTests(serverOutput, '/fr')
    errorTests()
    errorTests('/fr')

    it('should have middleware warning during build', () => {
      expect(buildOutput).toContain(middlewareWarning)
    })

    it('should have middleware warning during start', () => {
      expect(serverOutput.output).toContain(middlewareWarning)
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
  })

  describe('global', () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        env: {
          MIDDLEWARE_TEST: 'asdf',
          NEXT_RUNTIME: 'edge',
        },
      })
    })

    it('should contains process polyfill', async () => {
      const res = await fetchViaHTTP(context.appPort, `/global`)
      const json = await res.json()
      expect(json).toEqual({
        process: {
          env: {
            MIDDLEWARE_TEST: 'asdf',
            NEXT_RUNTIME: 'edge',
          },
        },
      })
    })
  })
})

function urlTests(_log, locale = '') {
  it('should set fetch user agent correctly', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/interface/fetchUserAgentDefault`
    )
    expect((await res.json()).headers['user-agent']).toBe('Next.js Middleware')

    const res2 = await fetchViaHTTP(
      context.appPort,
      `${locale}/interface/fetchUserAgentCustom`
    )
    expect((await res2.json()).headers['user-agent']).toBe('custom-agent')
  })

  it('rewrites by default to a target location', async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/urls`)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('URLs A')
  })

  it('throws when using URL with a relative URL', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/urls/relative-url`
    )
    const json = await res.json()
    expect(json.error.message).toContain('Invalid URL')
  })

  it('throws when using Request with a relative URL', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/urls/relative-request`
    )
    const json = await res.json()
    expect(json.error.message).toContain('Invalid URL')
  })

  it('throws when using NextRequest with a relative URL', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/urls/relative-next-request`
    )
    const json = await res.json()
    expect(json.error.message).toContain('Invalid URL')
  })

  it('warns when using Response.redirect with a relative URL', async () => {
    const response = await fetchViaHTTP(
      context.appPort,
      `${locale}/urls/relative-redirect`
    )
    expect(await response.json()).toEqual({
      error: {
        message: expect.stringContaining(urlsError),
      },
    })
  })

  it('warns when using NextResponse.redirect with a relative URL', async () => {
    const response = await fetchViaHTTP(
      context.appPort,
      `${locale}/urls/relative-next-redirect`
    )
    expect(await response.json()).toEqual({
      error: {
        message: expect.stringContaining(urlsError),
      },
    })
  })

  it('throws when using NextResponse.rewrite with a relative URL', async () => {
    const response = await fetchViaHTTP(
      context.appPort,
      `${locale}/urls/relative-next-rewrite`
    )
    expect(await response.json()).toEqual({
      error: {
        message: expect.stringContaining(urlsError),
      },
    })
  })
}

function rewriteTests(log, locale = '') {
  it('should override with rewrite internally correctly', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrites/about`,
      { override: 'internal' },
      { redirect: 'manual' }
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Welcome Page A')

    const browser = await webdriver(context.appPort, `${locale}/rewrites`)
    await browser.elementByCss('#override-with-internal-rewrite').click()
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /Welcome Page A/
    )
    expect(await browser.eval('window.location.pathname')).toBe(
      `${locale || ''}/rewrites/about`
    )
    expect(await browser.eval('window.location.search')).toBe(
      '?override=internal'
    )
  })

  it('should override with rewrite externally correctly', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrites/about`,
      { override: 'external' },
      { redirect: 'manual' }
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Example Domain')

    const browser = await webdriver(context.appPort, `${locale}/rewrites`)
    await browser.elementByCss('#override-with-external-rewrite').click()
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /Example Domain/
    )
    await check(
      () => browser.eval('window.location.pathname'),
      `${locale || ''}/rewrites/about`
    )
    await check(
      () => browser.eval('window.location.search'),
      '?override=external'
    )
  })

  it('should rewrite to fallback: true page successfully', async () => {
    const randomSlug = `another-${Date.now()}`
    const res2 = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrites/to-blog/${randomSlug}`
    )
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('Loading...')

    const randomSlug2 = `another-${Date.now()}`
    const browser = await webdriver(
      context.appPort,
      `${locale}/rewrites/to-blog/${randomSlug2}`
    )

    await check(async () => {
      const props = JSON.parse(await browser.elementByCss('#props').text())
      return props.params.slug === randomSlug2
        ? 'success'
        : JSON.stringify(props)
    }, 'success')
  })

  it(`${locale} should add a cookie and rewrite to a/b test`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrites/rewrite-to-ab-test`
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    // Set-Cookie header with Expires should not be split into two
    expect(res.headers.raw()['set-cookie']).toHaveLength(1)
    const bucket = getCookieFromResponse(res, 'bucket')
    const expectedText = bucket === 'a' ? 'Welcome Page A' : 'Welcome Page B'
    const browser = await webdriver(
      context.appPort,
      `${locale}/rewrites/rewrite-to-ab-test`
    )
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/rewrites/rewrite-to-ab-test`
      )
    } finally {
      await browser.close()
    }
    // -1 is returned if bucket was not found in func getCookieFromResponse
    expect(bucket).not.toBe(-1)
    expect($('.title').text()).toBe(expectedText)
  })

  it(`${locale} should clear query parameters`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrites/clear-query-params`,
      {
        a: '1',
        b: '2',
        foo: 'bar',
        allowed: 'kept',
      }
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    expect(JSON.parse($('#my-query-params').text())).toEqual({
      allowed: 'kept',
    })
  })

  it(`warns about a query param deleted`, async () => {
    await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrites/clear-query-params`,
      { a: '1', allowed: 'kept' }
    )
    expect(log.output).toContain(
      'Query params are no longer automatically merged for rewrites in middleware'
    )
  })

  it(`${locale} should rewrite to about page`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrites/rewrite-me-to-about`
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    const browser = await webdriver(
      context.appPort,
      `${locale}/rewrites/rewrite-me-to-about`
    )
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/rewrites/rewrite-me-to-about`
      )
    } finally {
      await browser.close()
    }
    expect($('.title').text()).toBe('About Page')
  })

  it(`${locale} support colons in path`, async () => {
    const path = `${locale}/rewrites/not:param`
    const res = await fetchViaHTTP(context.appPort, path)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#props').text()).toBe('not:param')
    const browser = await webdriver(context.appPort, path)
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(path)
    } finally {
      await browser.close()
    }
  })

  it(`${locale} can rewrite to path with colon`, async () => {
    const path = `${locale}/rewrites/rewrite-me-with-a-colon`
    const res = await fetchViaHTTP(context.appPort, path)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#props').text()).toBe('with:colon')
    const browser = await webdriver(context.appPort, path)
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(path)
    } finally {
      await browser.close()
    }
  })

  it(`${locale} can rewrite from path with colon`, async () => {
    const path = `${locale}/rewrites/colon:here`
    const res = await fetchViaHTTP(context.appPort, path)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#props').text()).toBe('no-colon-here')
    const browser = await webdriver(context.appPort, path)
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(path)
    } finally {
      await browser.close()
    }
  })

  it(`${locale} can rewrite from path with colon and retain query parameter`, async () => {
    const path = `${locale}/rewrites/colon:here?qp=arg`
    const res = await fetchViaHTTP(context.appPort, path)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#props').text()).toBe('no-colon-here')
    expect($('#qp').text()).toBe('arg')
    const browser = await webdriver(context.appPort, path)
    try {
      expect(
        await browser.eval(
          `window.location.href.replace(window.location.origin, '')`
        )
      ).toBe(path)
    } finally {
      await browser.close()
    }
  })

  it(`${locale} can rewrite to path with colon and retain query parameter`, async () => {
    const path = `${locale}/rewrites/rewrite-me-with-a-colon?qp=arg`
    const res = await fetchViaHTTP(context.appPort, path)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#props').text()).toBe('with:colon')
    expect($('#qp').text()).toBe('arg')
    const browser = await webdriver(context.appPort, path)
    try {
      expect(
        await browser.eval(
          `window.location.href.replace(window.location.origin, '')`
        )
      ).toBe(path)
    } finally {
      await browser.close()
    }
  })

  it(`${locale} should rewrite when not using localhost`, async () => {
    const res = await fetchViaHTTP(
      `http://localtest.me:${context.appPort}`,
      `${locale}/rewrites/rewrite-me-without-hard-navigation`
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('About Page')
  })

  it(`${locale} should rewrite to Vercel`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrites/rewrite-me-to-vercel`
    )
    const html = await res.text()
    // const browser = await webdriver(context.appPort, '/rewrite-me-to-vercel')
    // TODO: running this to chech the window.location.pathname hangs for some reason;
    expect(html).toContain('Example Domain')
  })

  it(`${locale} should rewrite without hard navigation`, async () => {
    const browser = await webdriver(context.appPort, '/rewrites/')
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#link-with-rewritten-url').click()
    await browser.waitForElementByCss('.refreshed')
    expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
    const element = await browser.elementByCss('.middleware')
    expect(await element.text()).toEqual('foo')
  })

  it('should allow to opt-out preflight caching', async () => {
    const browser = await webdriver(context.appPort, '/rewrites/')
    await browser.addCookie({ name: 'about-bypass', value: '1' })
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#link-with-rewritten-url').click()
    await browser.waitForElementByCss('.refreshed')
    await browser.deleteCookies()
    expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
    const element = await browser.elementByCss('.title')
    expect(await element.text()).toEqual('About Bypassed Page')
  })

  it(`${locale} should not call middleware with shallow push`, async () => {
    const browser = await webdriver(context.appPort, '/rewrites')
    await browser.elementByCss('#link-to-shallow-push').click()
    await browser.waitForCondition(
      'new URL(window.location.href).searchParams.get("path") === "rewrite-me-without-hard-navigation"'
    )
    await expect(async () => {
      await browser.waitForElementByCss('.refreshed', 500)
    }).rejects.toThrow()
  })
}

function redirectTests(locale = '') {
  it(`${locale} should redirect`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/redirects/old-home`
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    const browser = await webdriver(
      context.appPort,
      `${locale}/redirects/old-home`
    )
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/redirects/new-home`
      )
    } finally {
      await browser.close()
    }
    expect($('.title').text()).toBe('Welcome to a new page')
  })

  it(`${locale} should redirect cleanly with the original url param`, async () => {
    const browser = await webdriver(
      context.appPort,
      `${locale}/redirects/blank-page?foo=bar`
    )
    try {
      expect(
        await browser.eval(
          `window.location.href.replace(window.location.origin, '')`
        )
      ).toBe(`${locale}/redirects/new-home`)
    } finally {
      await browser.close()
    }
  })

  it(`${locale} should redirect multiple times`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/redirects/redirect-me-alot`
    )
    const browser = await webdriver(
      context.appPort,
      `${locale}/redirects/redirect-me-alot`
    )
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/redirects/new-home`
      )
    } finally {
      await browser.close()
    }
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('Welcome to a new page')
  })

  it(`${locale} should redirect (infinite-loop)`, async () => {
    await expect(
      fetchViaHTTP(context.appPort, `${locale}/redirects/infinite-loop`)
    ).rejects.toThrow()
  })

  it(`${locale} should redirect to api route with locale`, async () => {
    const browser = await webdriver(context.appPort, `${locale}/redirects`)
    await browser.elementByCss('#link-to-api-with-locale').click()
    await browser.waitForCondition('window.location.pathname === "/api/ok"')
    const body = await browser.elementByCss('body').text()
    expect(body).toBe('ok')
  })
}

function responseTests(locale = '') {
  it(`${locale} responds with multiple cookies`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/two-cookies`
    )

    expect(res.headers.raw()['set-cookie']).toEqual([
      'foo=chocochip',
      'bar=chocochip',
    ])
  })

  it(`${locale} should stream a response`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/stream-a-response`
    )
    const html = await res.text()
    expect(html).toBe('this is a streamed response with some text')
  })

  it(`${locale} should respond with a body`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/send-response`
    )
    const html = await res.text()
    expect(html).toBe('{"message":"hi!"}')
  })

  it(`${locale} should respond with a 401 status code`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/bad-status`
    )
    const html = await res.text()
    expect(res.status).toBe(401)
    expect(html).toBe('Auth required')
  })

  it(`${locale} should render a React component`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/react?name=jack`
    )
    const html = await res.text()
    expect(html).toBe('<h1>SSR with React! Hello, jack</h1>')
  })

  it(`${locale} should stream a React component`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/react-stream`
    )
    const html = await res.text()
    expect(html).toBe('<h1>I am a stream</h1><p>I am another stream</p>')
  })

  it(`${locale} should stream a long response`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/responses/stream-long')
    const html = await res.text()
    expect(html).toBe(
      'this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds '
    )
  })

  it(`${locale} should render the right content via SSR`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/responses/')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('Hello World')
  })

  it(`${locale} should respond with 2 nested headers`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/header?nested-header=true`
    )
    expect(res.headers.get('x-first-header')).toBe('valid')
    expect(res.headers.get('x-nested-header')).toBe('valid')
  })

  it(`${locale} should respond with a header`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/header`
    )
    expect(res.headers.get('x-first-header')).toBe('valid')
  })

  it(`${locale} should respond with top level headers and append deep headers`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/deep?nested-header=true&append-me=true&cookie-me=true`
    )
    expect(res.headers.get('x-nested-header')).toBe('valid')
    expect(res.headers.get('x-deep-header')).toBe('valid')
    expect(res.headers.get('x-append-me')).toBe('top, deep')
    expect(res.headers.raw()['set-cookie']).toEqual([
      'bar=chocochip',
      'foo=oatmeal',
    ])
  })

  it(`${locale} should be intercepted by deep middleware`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/responses/deep?deep-intercept=true`
    )
    expect(await res.text()).toBe('intercepted!')
  })
}

function interfaceTests(locale = '') {
  it(`${locale} \`globalThis\` is accessible`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/interface/globalthis')
    const globals = await res.json()
    expect(globals.length > 0).toBe(true)
  })

  it(`${locale} collection constructors are shared`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/interface/webcrypto')
    const response = await res.json()
    expect('error' in response).toBe(false)
  })

  it(`${locale} fetch accepts a URL instance`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/interface/fetchURL')
    const response = await res.json()
    expect('error' in response).toBe(true)
    expect(response.error.name).not.toBe('TypeError')
  })

  it(`${locale} abort a fetch request`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      '/interface/abort-controller'
    )
    const response = await res.json()

    expect('error' in response).toBe(true)
    expect(response.error.name).toBe('AbortError')
    expect(response.error.message).toBe('The user aborted a request.')
  })

  it(`${locale} should validate request url parameters from a static route`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/interface/static`
    )
    //expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/interface/static')
    expect(res.headers.get('req-url-params')).not.toBe('{}')
    expect(res.headers.get('req-url-query')).not.toBe('bar')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale.slice(1))
    }
  })

  it(`${locale} should validate request url parameters from a dynamic route with param 1`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/interface/1`)
    //expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/interface/1')
    expect(res.headers.get('req-url-params')).toBe('{"id":"1"}')
    expect(res.headers.get('req-url-page')).toBe('/interface/[id]')
    expect(res.headers.get('req-url-query')).not.toBe('bar')

    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale.slice(1))
    }
  })

  it(`${locale} should validate request url parameters from a dynamic route with param abc123`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/interface/abc123`
    )
    //expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/interface/abc123')
    expect(res.headers.get('req-url-params')).toBe('{"id":"abc123"}')
    expect(res.headers.get('req-url-page')).toBe('/interface/[id]')
    expect(res.headers.get('req-url-query')).not.toBe('bar')

    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale.slice(1))
    }
  })

  it(`${locale} should validate request url parameters from a dynamic route with param abc123 and query foo = bar`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/interface/abc123?foo=bar`
    )
    //expect(res.headers.get('req-url-basepath')).toBe('')
    expect(res.headers.get('req-url-pathname')).toBe('/interface/abc123')
    expect(res.headers.get('req-url-params')).toBe('{"id":"abc123"}')
    expect(res.headers.get('req-url-page')).toBe('/interface/[id]')
    expect(res.headers.get('req-url-query')).toBe('bar')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale.slice(1))
    }
  })

  it(`${locale} renders correctly rewriting with a root subrequest`, async () => {
    const browser = await webdriver(
      context.appPort,
      '/interface/root-subrequest'
    )
    const element = await browser.elementByCss('.title')
    expect(await element.text()).toEqual('Dynamic route')
  })

  it(`${locale} allows subrequests without infinite loops`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `/interface/root-subrequest`
    )
    expect(res.headers.get('x-dynamic-path')).toBe('true')
  })

  it(`${locale} renders correctly rewriting to a different dynamic path`, async () => {
    const browser = await webdriver(
      context.appPort,
      '/interface/dynamic-replace'
    )
    const element = await browser.elementByCss('.title')
    expect(await element.text()).toEqual('Parts page')
    const logs = await browser.log()
    expect(
      logs.every((log) => log.source === 'log' || log.source === 'info')
    ).toEqual(true)
  })
}

function errorTests(locale = '') {
  it(`${locale} should hard-navigate when preflight request failed`, async () => {
    const browser = await webdriver(context.appPort, `${locale}/errors`)
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#throw-on-preflight').click()
    await browser.waitForElementByCss('.refreshed')
    expect(await browser.eval('window.__SAME_PAGE')).toBeUndefined()
  })
}

function getCookieFromResponse(res, cookieName) {
  // node-fetch bundles the cookies as string in the Response
  const cookieArray = res.headers.raw()['set-cookie']
  for (const cookie of cookieArray) {
    let individualCookieParams = cookie.split(';')
    let individualCookie = individualCookieParams[0].split('=')
    if (individualCookie[0] === cookieName) {
      return individualCookie[1]
    }
  }
  return -1
}
