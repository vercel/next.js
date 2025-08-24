/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  check,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should update props on locale change with same hash', async () => {
    const browser = await webdriver(appPort, `/about#hash`)

    await browser.elementByCss('#change-locale').click()

    await check(() => browser.eval('window.location.pathname'), '/fr/about')
    await check(() => browser.eval('window.location.hash'), '#hash')

    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(await browser.elementByCss('#props-locale').text()).toBe('fr')

    await browser.elementByCss('#change-locale').click()

    await check(() => browser.eval('window.location.pathname'), '/about')
    await check(() => browser.eval('window.location.hash'), '#hash')

    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(await browser.elementByCss('#props-locale').text()).toBe('en')
  })

  it('should update props on locale change with same hash (dynamic page)', async () => {
    const browser = await webdriver(appPort, `/posts/a#hash`)

    await browser.elementByCss('#change-locale').click()

    await check(() => browser.eval('window.location.pathname'), '/fr/posts/a')
    await check(() => browser.eval('window.location.hash'), '#hash')

    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(await browser.elementByCss('#props-locale').text()).toBe('fr')

    await browser.elementByCss('#change-locale').click()

    await check(() => browser.eval('window.location.pathname'), '/posts/a')
    await check(() => browser.eval('window.location.hash'), '#hash')

    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(await browser.elementByCss('#props-locale').text()).toBe('en')
  })

  it('should trigger hash change events', async () => {
    const browser = await webdriver(appPort, `/about#hash`)

    await check(() => browser.eval('window.location.hash'), '#hash')

    await browser.elementByCss('#hash-change').click()

    await check(() => browser.eval('window.hashChangeStart'), 'yes')
    await check(() => browser.eval('window.hashChangeComplete'), 'yes')

    await check(() => browser.eval('window.location.hash'), '#newhash')
  })
}

describe('Hash changes i18n', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))
      runTests(true)
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))
      runTests()
    }
  )
})
