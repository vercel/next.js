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

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))

let appPort
let app

function runTests() {
  it.each([
    { pathname: '/', query: {} },
    { pathname: '/en', query: {} },
    { pathname: '/fr', query: {} },
    { pathname: '/', query: { hello: 'world' } },
    { pathname: '/en', query: { hello: 'world' } },
    { pathname: '/fr', query: { hello: 'world' } },
  ])(
    'should not rewrite for index page - $pathname, $query',
    async ({ pathname, query }) => {
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
  )

  it.each([
    { pathname: '/dynamic/first', query: {} },
    { pathname: '/en/dynamic/first', query: {} },
    { pathname: '/fr/dynamic/first', query: {} },
    { pathname: '/dynamic/first', query: { hello: 'world' } },
    { pathname: '/en/dynamic/first', query: { hello: 'world' } },
    { pathname: '/fr/dynamic/first', query: { hello: 'world' } },
  ])(
    'should not rewrite for dynamic page - $pathname, $query',
    async ({ pathname, query }) => {
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
  )
}

describe('i18n Support', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
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
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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
    }
  )
})
