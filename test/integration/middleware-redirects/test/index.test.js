/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
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

describe('Middleware Redirect', () => {
  describe('dev mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      context.appPort = await findPort()
      context.buildId = 'development'
      context.app = await launchApp(context.appDir, context.appPort)
    })

    tests(context)
    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })

  describe('production mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      await nextBuild(context.appDir)
      context.buildId = await fs.readFile(
        join(context.appDir, '.next/BUILD_ID'),
        'utf8'
      )
      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort)
    })

    tests(context)
    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })
})

function tests(context) {
  it('does not include the locale in redirects by default', async () => {
    const res = await fetchViaHTTP(context.appPort, `/old-home`, undefined, {
      redirect: 'manual',
    })
    expect(res.headers.get('location')?.endsWith('/default/about')).toEqual(
      false
    )
  })

  it(`should redirect to data urls with data requests and internal redirects`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `/_next/data/${context.buildId}/es/old-home.json`,
      { override: 'internal' },
      { redirect: 'manual' }
    )

    expect(
      res.headers
        .get('x-nextjs-redirect')
        ?.endsWith(
          `/_next/data/${context.buildId}/es/new-home.json?override=internal`
        )
    ).toEqual(true)
    expect(res.headers.get('location')).toEqual(null)
  })

  it(`should redirect to external urls with data requests and external redirects`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `/_next/data/${context.buildId}/es/old-home.json`,
      { override: 'external' },
      { redirect: 'manual' }
    )

    expect(res.headers.get('x-nextjs-redirect')).toEqual('https://example.com/')
    expect(res.headers.get('location')).toEqual(null)

    const browser = await webdriver(context.appPort, '/')
    await browser.elementByCss('#old-home-external').click()
    await check(async () => {
      expect(await browser.elementByCss('h1').text()).toEqual('Example Domain')
      return 'yes'
    }, 'yes')
  })
}

function testsWithLocale(context, locale = '') {
  const label = locale ? `${locale} ` : ``

  it(`${label}should redirect`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/old-home`)
    const html = await res.text()
    const $ = cheerio.load(html)
    const browser = await webdriver(context.appPort, `${locale}/old-home`)
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/new-home`
      )
    } finally {
      await browser.close()
    }
    expect($('.title').text()).toBe('Welcome to a new page')
  })

  it(`${label}should implement internal redirects`, async () => {
    const browser = await webdriver(context.appPort, `${locale}`)
    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#old-home').click()
    await browser.waitForElementByCss('#new-home-title')
    expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/new-home`
      )
    } finally {
      await browser.close()
    }
  })

  it(`${label}should redirect cleanly with the original url param`, async () => {
    const browser = await webdriver(
      context.appPort,
      `${locale}/blank-page?foo=bar`
    )
    try {
      expect(
        await browser.eval(
          `window.location.href.replace(window.location.origin, '')`
        )
      ).toBe(`${locale}/new-home`)
    } finally {
      await browser.close()
    }
  })

  it(`${label}should redirect multiple times`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/redirect-me-alot`
    )
    const browser = await webdriver(
      context.appPort,
      `${locale}/redirect-me-alot`
    )
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        `${locale}/new-home`
      )
    } finally {
      await browser.close()
    }
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('Welcome to a new page')
  })

  it(`${label}should redirect (infinite-loop)`, async () => {
    await expect(
      fetchViaHTTP(context.appPort, `${locale}/infinite-loop`)
    ).rejects.toThrow()
  })

  it(`${label}should redirect to api route with locale`, async () => {
    const browser = await webdriver(context.appPort, `${locale}`)
    await browser.elementByCss('#link-to-api-with-locale').click()
    await browser.waitForCondition('window.location.pathname === "/api/ok"')
    const body = await browser.elementByCss('body').text()
    expect(body).toBe('ok')
  })
}
