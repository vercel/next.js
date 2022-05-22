/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
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
      context.app = await launchApp(context.appDir, context.appPort)
    })

    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })

  describe('production mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      await nextBuild(context.appDir)
      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort)
    })

    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })
})

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
