/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  launchApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
let appPort
let app

const runTests = () => {
  it('should break rewrites chain when dynamic route matches', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#product-link').click()
    await browser.waitForElementByCss('#product')

    expect(await browser.elementByCss('#product').text()).toBe('product: first')
  })

  it('ensure rewrites work without the need to provide destination params', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#item-link').click()
    await browser.waitForElementByCss('#product')

    expect(await browser.elementByCss('#product').text()).toBe('item: 1')
  })

  it('ensure rewrites work with interpolation', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#item-link-interpolate').click()
    await browser.waitForElementByCss('#product')

    expect(await browser.elementByCss('#product').text()).toBe('item: 2')
  })

  it('ensure correct URL appears with rewrites interpolation', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#item-link-interpolate-query').click()
    await browser.waitForElementByCss('#product')

    expect(await browser.elementByCss('#product').text()).toBe('item: 3')
    expect(await browser.url()).toBe(`http://localhost:${appPort}/item/3`)
  })

  it('should break rewrites chain when normal page matches', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#products-link').click()
    await browser.waitForElementByCss('#products')

    expect(await browser.elementByCss('#products').text()).toBe('products')
  })

  it('should break rewrites chain when dynamic catch-all route matches', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#category-link').click()
    await browser.waitForElementByCss('#category')

    expect(await browser.elementByCss('#category').text()).toBe(
      'category: first'
    )
  })

  it('should break rewrites chain when dynamic catch-all route multi-level matches', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#category-link-again').click()
    await browser.waitForElementByCss('#category')

    expect(await browser.elementByCss('#category').text()).toBe(
      'category: hello/world'
    )
  })

  it('should break rewrites chain after matching /category', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#categories-link').click()
    await browser.waitForElementByCss('#categories')

    expect(await browser.elementByCss('#categories').text()).toBe('categories')
  })
}

describe('Client-side rewrites resolving', () => {
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
      appPort = await findPort()
      await nextBuild(appDir)
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
