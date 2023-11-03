/* eslint-env jest */

import webdriver from 'next-webdriver'

import cheerio from 'cheerio'
import {
  fetchViaHTTP,
  renderViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  check,
} from 'next-test-utils'
import { join } from 'path'

let app
let appPort
const appDir = join(__dirname, '../')

function runTests(dev = false) {
  it('ssr async page modules', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect($('#app-value').text()).toBe('hello')
    expect($('#page-value').text()).toBe('42')
  })

  it('csr async page modules', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      expect(await browser.elementByCss('#app-value').text()).toBe('hello')
      expect(await browser.elementByCss('#page-value').text()).toBe('42')
      expect(await browser.elementByCss('#doc-value').text()).toBe('doc value')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('works on async api routes', async () => {
    const res = await fetchViaHTTP(appPort, '/api/hello')
    expect(res.status).toBe(200)
    const result = await res.json()
    expect(result).toHaveProperty('value', 42)
  })

  it('works with getServerSideProps', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/gssp')
      expect(await browser.elementByCss('#gssp-value').text()).toBe('42')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('works with getStaticProps', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/gsp')
      expect(await browser.elementByCss('#gsp-value').text()).toBe('42')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('can render async 404 pages', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/dhiuhefoiahjeoij')
      expect(await browser.elementByCss('#content-404').text()).toBe("hi y'all")
    } finally {
      if (browser) await browser.close()
    }
  })

  // TODO: investigate this test flaking
  it.skip('can render async AMP pages', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/config')
      await check(
        () => browser.elementByCss('#amp-timeago').text(),
        'just now',
        true
      )
    } finally {
      if (browser) await browser.close()
    }
  })
  ;(dev ? it.skip : it)('can render async error page', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/make-error')
      expect(await browser.elementByCss('#content-error').text()).toBe(
        'hello error'
      )
    } finally {
      if (browser) await browser.close()
    }
  })
}

describe('Async modules', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests(true)
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests()
  })
})
