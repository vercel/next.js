/* eslint-env jest */

import cheerio from 'cheerio'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  check,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

let app
let appPort
const appDir = join(__dirname, '../')

function runTests() {
  it('should ssr page /', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('index')
  })

  it('should client render page /', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index')
    } finally {
      await browser.close()
    }
  })

  it('should follow link to /', async () => {
    const browser = await webdriver(appPort, '/links')
    try {
      await browser.elementByCss('#link1').click()
      await waitFor(1000)
      await check(() => browser.elementByCss('#page').text(), /^index$/)
    } finally {
      await browser.close()
    }
  })

  it('should ssr page /index', async () => {
    const html = await renderViaHTTP(appPort, '/index')
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('index > index')
  })

  it('should client render page /index', async () => {
    const browser = await webdriver(appPort, '/index')
    try {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > index')
    } finally {
      await browser.close()
    }
  })

  it('should follow link to /index', async () => {
    const browser = await webdriver(appPort, '/links')
    try {
      await browser.elementByCss('#link2').click()
      await waitFor(1000)
      await check(() => browser.elementByCss('#page').text(), /^index > index$/)
    } finally {
      await browser.close()
    }
  })

  it('should ssr page /index/user', async () => {
    const html = await renderViaHTTP(appPort, '/index/user')
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('index > user')
  })

  it('should client render page /index/user', async () => {
    const browser = await webdriver(appPort, '/index/user')
    try {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > user')
    } finally {
      await browser.close()
    }
  })

  it('should follow link to /index/user', async () => {
    const browser = await webdriver(appPort, '/links')
    try {
      await browser.elementByCss('#link5').click()
      await waitFor(1000)
      await check(() => browser.elementByCss('#page').text(), /^index > user$/)
    } finally {
      await browser.close()
    }
  })

  it('should ssr page /index/project', async () => {
    const html = await renderViaHTTP(appPort, '/index/project')
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('index > project')
  })

  it('should client render page /index/project', async () => {
    const browser = await webdriver(appPort, '/index/project')
    try {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > project')
    } finally {
      await browser.close()
    }
  })

  it('should follow link to /index/project', async () => {
    const browser = await webdriver(appPort, '/links')
    try {
      await browser.elementByCss('#link6').click()
      await waitFor(1000)
      await check(
        () => browser.elementByCss('#page').text(),
        /^index > project$/
      )
    } finally {
      await browser.close()
    }
  })

  it('should ssr page /index/index', async () => {
    const html = await renderViaHTTP(appPort, '/index/index')
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('index > index > index')
  })

  it('should client render page /index/index', async () => {
    const browser = await webdriver(appPort, '/index/index')
    try {
      const text = await browser.elementByCss('#page').text()
      expect(text).toBe('index > index > index')
    } finally {
      await browser.close()
    }
  })

  it('should follow link to /index/index', async () => {
    const browser = await webdriver(appPort, '/links')
    try {
      await browser.elementByCss('#link3').click()
      await waitFor(1000)
      await check(
        () => browser.elementByCss('#page').text(),
        /^index > index > index$/
      )
    } finally {
      await browser.close()
    }
  })

  it('should 404 on /index/index/index', async () => {
    const response = await fetchViaHTTP(appPort, '/index/index/index')
    expect(response.status).toBe(404)
  })

  it('should not find a link to /index/index/index', async () => {
    const browser = await webdriver(appPort, '/links')
    try {
      await browser.elementByCss('#link4').click()
      await waitFor(1000)
      await check(() => browser.elementByCss('h1').text(), /404/)
    } finally {
      await browser.close()
    }
  })
}

const nextConfig = join(appDir, 'next.config.js')

describe('nested index.js', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      const curConfig = await fs.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fs.writeFile(nextConfig, `module.exports = {}`)
      }
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
