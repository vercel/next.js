import url from 'url'
import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  File,
  launchApp,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))

let appPort
let app

function runTests() {
  it('should not rewrite for index page', async () => {
    for (const [pathname, query] of [
      ['/', {}],
      ['/en', {}],
      ['/fr', {}],
      ['/', { hello: 'world' }],
      ['/en', { hello: 'world' }],
      ['/fr', { hello: 'world' }],
    ]) {
      const asPath = url.format({ pathname, query })
      const browser = await webdriver(appPort, asPath)

      expect(JSON.parse(await browser.elementByCss('#router').text())).toEqual({
        index: true,
        pathname: '/',
        asPath: url.format({ pathname: '/', query }),
        query,
      })
      await waitFor(1000)

      expect(JSON.parse(await browser.elementByCss('#router').text())).toEqual({
        index: true,
        pathname: '/',
        asPath: url.format({ pathname: '/', query }),
        query,
      })
    }
  })

  it('should not rewrite for dynamic page', async () => {
    for (const [pathname, query] of [
      ['/dynamic/first', {}],
      ['/en/dynamic/first', {}],
      ['/fr/dynamic/first', {}],
      ['/dynamic/first', { hello: 'world' }],
      ['/en/dynamic/first', { hello: 'world' }],
      ['/fr/dynamic/first', { hello: 'world' }],
    ]) {
      const asPath = url.format({ pathname, query })
      const browser = await webdriver(appPort, asPath)

      expect(JSON.parse(await browser.elementByCss('#router').text())).toEqual({
        dynamic: true,
        pathname: '/dynamic/[slug]',
        asPath: url.format({ pathname: '/dynamic/first', query }),
        query: {
          ...query,
          slug: 'first',
        },
      })
      await waitFor(1000)

      expect(JSON.parse(await browser.elementByCss('#router').text())).toEqual({
        dynamic: true,
        pathname: '/dynamic/[slug]',
        asPath: url.format({ pathname: '/dynamic/first', query }),
        query: {
          ...query,
          slug: 'first',
        },
      })
    }
  })
}

describe('i18n Support', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    runTests()
  })
})
