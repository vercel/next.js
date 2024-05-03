/* eslint-env jest */

import { join } from 'path'
import {
  check,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')

let appPort
let app

const runTests = () => {
  it('should allow manual href/as on index page', async () => {
    const browser = await webdriver(appPort, '/')

    expect(await browser.elementByCss('#index').text()).toBe('index page')
    expect(await browser.hasElementByCssSelector('#modal')).toBeFalsy()
    await browser.eval('window.beforeNav = 1')

    await browser.elementByCss('#to-modal').click()

    expect(await browser.elementByCss('#index').text()).toBe('index page')
    expect(await browser.hasElementByCssSelector('#modal')).toBeTruthy()
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      imageId: '123',
    })

    await browser
      .elementByCss('#to-preview')
      .click()
      .waitForElementByCss('#preview')

    expect(await browser.elementByCss('#preview').text()).toBe('preview page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: '123',
    })

    await browser.back()

    await browser
      .elementByCss('#to-another')
      .click()
      .waitForElementByCss('#another')

    expect(await browser.elementByCss('#another').text()).toBe('another page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    await browser.back()

    await browser.elementByCss('#to-rewrite-me').click()

    expect(await browser.elementByCss('#another').text()).toBe('another page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    await browser.back()

    await browser
      .elementByCss('#to-index-as-rewrite')
      .click()
      .waitForElementByCss('#index')

    expect(await browser.elementByCss('#index').text()).toBe('index page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
  })

  it('should allow manual href/as on dynamic page', async () => {
    const browser = await webdriver(appPort, '/preview/123')

    expect(await browser.elementByCss('#preview').text()).toBe('preview page')
    await browser.eval('window.beforeNav = 1')

    await browser
      .elementByCss('#to-modal')
      .click()
      .waitForElementByCss('#index')

    expect(await browser.elementByCss('#index').text()).toBe('index page')
    expect(await browser.hasElementByCssSelector('#modal')).toBeTruthy()
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      imageId: '123',
    })

    await browser
      .elementByCss('#to-preview')
      .click()
      .waitForElementByCss('#preview')

    expect(await browser.elementByCss('#preview').text()).toBe('preview page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: '123',
    })

    await browser.elementByCss('#to-preview').click()

    expect(await browser.elementByCss('#preview').text()).toBe('preview page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    await check(
      async () =>
        JSON.parse(
          await browser.eval('document.querySelector("#query").innerHTML')
        ).slug,
      '321'
    )

    await browser
      .elementByCss('#to-another')
      .click()
      .waitForElementByCss('#another')

    expect(await browser.elementByCss('#another').text()).toBe('another page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    await browser.back().waitForElementByCss('#preview')
    await browser.elementByCss('#to-rewrite-me').click()

    expect(await browser.elementByCss('#another').text()).toBe('another page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    await browser.back().waitForElementByCss('#preview')

    await browser
      .elementByCss('#to-preview-as-rewrite')
      .click()
      .waitForElementByCss('#preview')

    expect(await browser.elementByCss('#preview').text()).toBe('preview page')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      slug: '321',
    })

    await browser.back().waitForElementByCss('#preview')

    await browser
      .elementByCss('#to-news-as-blog')
      .click()
      .waitForElementByCss('#news')

    expect(await browser.elementByCss('#news').text()).toBe('news page')
    expect(await browser.elementByCss('#asPath').text()).toBe('/blog')
    expect(await browser.eval('window.beforeNav')).toBe(1)
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})
  })
}

describe('rewrites manual href/as', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
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
