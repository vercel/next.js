/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  launchApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = join(__dirname, '..')
let app
let appPort

const runTests = () => {
  it('should load auto-export page correctly', async () => {
    const browser = await webdriver(appPort, '/')
    expect(await browser.elementByCss('#index').text()).toBe('index')
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })

  it('should load getStaticProps page correctly', async () => {
    const browser = await webdriver(appPort, '/gsp')
    expect(await browser.elementByCss('#gsp').text()).toBe('getStaticProps')
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })

  it('should load getServerSideProps page correctly', async () => {
    const browser = await webdriver(appPort, '/gssp')
    expect(await browser.elementByCss('#gssp').text()).toBe(
      'getServerSideProps'
    )
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })

  it('should load 404 page correctly', async () => {
    const browser = await webdriver(appPort, '/non-existent')
    expect(await browser.elementByCss('h2').text()).toBe(
      'An unexpected error has occurred.'
    )
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })

  it('should navigate between pages correctly', async () => {
    const browser = await webdriver(appPort, '/')

    await browser.eval('window.beforeNav = "hi"')
    await browser.elementByCss('#to-gsp').click()
    await browser.waitForElementByCss('#gsp')

    expect(await browser.elementByCss('#gsp').text()).toBe('getStaticProps')
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.back()
    await browser.waitForElementByCss('#index')
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.elementByCss('#to-gssp').click()
    await browser.waitForElementByCss('#gssp')

    expect(await browser.elementByCss('#gssp').text()).toBe(
      'getServerSideProps'
    )
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.back()
    await browser.waitForElementByCss('#index')
    expect(await browser.eval('window.beforeNav')).toBe('hi')

    await browser.elementByCss('#to-404').click()
    await browser.waitForElementByCss('h2')
    expect(await browser.eval('window.beforeNav')).toBe(null)
    expect(await browser.elementByCss('h2').text()).toBe(
      'An unexpected error has occurred.'
    )
    expect(await browser.eval('window.uncaughtErrors')).toEqual([])
  })
}

describe('Error no pageProps', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
