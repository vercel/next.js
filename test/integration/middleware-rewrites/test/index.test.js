/* eslint-env jest */

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

const context = {
  appDir: join(__dirname, '../'),
  logs: { output: '', stdout: '', stderr: '' },
}

describe('Middleware Rewrite', () => {
  describe('dev mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
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
    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })

  describe('production mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      await nextBuild(context.appDir, undefined)
      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort, {
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
    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })
})

function tests(context, locale = '') {
  it('should override with rewrite internally correctly', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/about`,
      { override: 'internal' },
      { redirect: 'manual' }
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Welcome Page A')

    const browser = await webdriver(context.appPort, `${locale}`)
    await browser.elementByCss('#override-with-internal-rewrite').click()
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /Welcome Page A/
    )
    expect(await browser.eval('window.location.pathname')).toBe(
      `${locale || ''}/about`
    )
    expect(await browser.eval('window.location.search')).toBe(
      '?override=internal'
    )
  })

  it('should override with rewrite externally correctly', async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/about`,
      { override: 'external' },
      { redirect: 'manual' }
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Example Domain')

    const browser = await webdriver(context.appPort, `${locale}`)
    await browser.elementByCss('#override-with-external-rewrite').click()
    await check(
      () => browser.eval('document.documentElement.innerHTML'),
      /Example Domain/
    )
    await check(
      () => browser.eval('window.location.pathname'),
      `${locale || ''}/about`
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
      `${locale}/to-blog/${randomSlug}`
    )
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('Loading...')

    const randomSlug2 = `another-${Date.now()}`
    const browser = await webdriver(
      context.appPort,
      `${locale}/to-blog/${randomSlug2}`
    )

    await check(async () => {
      const props = JSON.parse(await browser.elementByCss('#props').text())
      return props.params.slug === randomSlug2
        ? 'success'
        : JSON.stringify(props)
    }, 'success')
  })

  it(`warns about a query param deleted`, async () => {
    await fetchViaHTTP(context.appPort, `${locale}/clear-query-params`, {
      a: '1',
      allowed: 'kept',
    })
    expect(context.logs.output).toContain(
      'Query params are no longer automatically merged for rewrites in middleware'
    )
  })

  it('should allow to opt-out preflight caching', async () => {
    const browser = await webdriver(context.appPort, '/')
    await browser.addCookie({ name: 'about-bypass', value: '1' })
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#link-with-rewritten-url').click()
    await browser.waitForElementByCss('.refreshed')
    await browser.deleteCookies()
    expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
    const element = await browser.elementByCss('.title')
    expect(await element.text()).toEqual('About Bypassed Page')
  })

  it(`should allow to rewrite keeping the locale in pathname`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/fr/country', {
      country: 'spain',
    })
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#locale').text()).toBe('fr')
    expect($('#country').text()).toBe('spain')
  })

  it(`should allow to rewrite to a different locale`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/country', {
      'my-locale': 'es',
    })
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#locale').text()).toBe('es')
    expect($('#country').text()).toBe('us')
  })
}

function testsWithLocale(context, locale = '') {
  const label = locale ? `${locale} ` : ``

  it(`${label}should add a cookie and rewrite to a/b test`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrite-to-ab-test`
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    // Set-Cookie header with Expires should not be split into two
    expect(res.headers.raw()['set-cookie']).toHaveLength(1)
    const bucket = getCookieFromResponse(res, 'bucket')
    const expectedText = bucket === 'a' ? 'Welcome Page A' : 'Welcome Page B'
    const browser = await webdriver(
      context.appPort,
      `${locale}/rewrite-to-ab-test`
    )
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/rewrite-to-ab-test`
      )
    } finally {
      await browser.close()
    }
    // -1 is returned if bucket was not found in func getCookieFromResponse
    expect(bucket).not.toBe(-1)
    expect($('.title').text()).toBe(expectedText)
  })

  it(`${label}should clear query parameters`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/clear-query-params`,
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

  it(`${label}should rewrite to about page`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrite-me-to-about`
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    const browser = await webdriver(
      context.appPort,
      `${locale}/rewrite-me-to-about`
    )
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/rewrite-me-to-about`
      )
    } finally {
      await browser.close()
    }
    expect($('.title').text()).toBe('About Page')
  })

  it(`${label}support colons in path`, async () => {
    const path = `${locale}/not:param`
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

  it(`${label}can rewrite to path with colon`, async () => {
    const path = `${locale}/rewrite-me-with-a-colon`
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

  it(`${label}can rewrite from path with colon`, async () => {
    const path = `${locale}/colon:here`
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

  it(`${label}can rewrite from path with colon and retain query parameter`, async () => {
    const path = `${locale}/colon:here?qp=arg`
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

  it(`${label}can rewrite to path with colon and retain query parameter`, async () => {
    const path = `${locale}/rewrite-me-with-a-colon?qp=arg`
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

  it(`${label}should rewrite when not using localhost`, async () => {
    const res = await fetchViaHTTP(
      `http://localtest.me:${context.appPort}`,
      `${locale}/rewrite-me-without-hard-navigation`
    )
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('About Page')
  })

  it(`${label}should rewrite to Vercel`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/rewrite-me-to-vercel`
    )
    const html = await res.text()
    // const browser = await webdriver(context.appPort, '/rewrite-me-to-vercel')
    // TODO: running this to chech the window.location.pathname hangs for some reason;
    expect(html).toContain('Example Domain')
  })

  it(`${label}should rewrite without hard navigation`, async () => {
    const browser = await webdriver(context.appPort, '/')
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#link-with-rewritten-url').click()
    await browser.waitForElementByCss('.refreshed')
    expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
    const element = await browser.elementByCss('.middleware')
    expect(await element.text()).toEqual('foo')
  })

  it(`${label}should not call middleware with shallow push`, async () => {
    const browser = await webdriver(context.appPort, '')
    await browser.elementByCss('#link-to-shallow-push').click()
    await browser.waitForCondition(
      'new URL(window.location.href).searchParams.get("path") === "rewrite-me-without-hard-navigation"'
    )
    await expect(async () => {
      await browser.waitForElementByCss('.refreshed', 500)
    }).rejects.toThrow()
  })

  it(`${label}should correctly rewriting to a different dynamic path`, async () => {
    const browser = await webdriver(context.appPort, '/dynamic-replace')
    const element = await browser.elementByCss('.title')
    expect(await element.text()).toEqual('Parts page')
    const logs = await browser.log()
    expect(
      logs.every((log) => log.source === 'log' || log.source === 'info')
    ).toEqual(true)
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
