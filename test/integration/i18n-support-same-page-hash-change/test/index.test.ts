/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  retry,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should update props on locale change with same hash', async () => {
    const browser = await webdriver(appPort, `/about#hash`)

    await browser.elementByCss('#change-locale').click()

    await retry(
      async () => {
        expect(await browser.eval('window.location.pathname')).toBe('/fr/about')
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.eval('window.location.hash')).toBe('#hash')
      },
      30000,
      1000
    )

    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(await browser.elementByCss('#props-locale').text()).toBe('fr')

    await browser.elementByCss('#change-locale').click()

    await retry(
      async () => {
        expect(await browser.eval('window.location.pathname')).toBe('/about')
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.eval('window.location.hash')).toBe('#hash')
      },
      30000,
      1000
    )

    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(await browser.elementByCss('#props-locale').text()).toBe('en')
  })

  it('should update props on locale change with same hash (dynamic page)', async () => {
    const browser = await webdriver(appPort, `/posts/a#hash`)

    await browser.elementByCss('#change-locale').click()

    await retry(
      async () => {
        expect(await browser.eval('window.location.pathname')).toBe(
          '/fr/posts/a'
        )
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.eval('window.location.hash')).toBe('#hash')
      },
      30000,
      1000
    )

    expect(await browser.elementByCss('#router-locale').text()).toBe('fr')
    expect(await browser.elementByCss('#props-locale').text()).toBe('fr')

    await browser.elementByCss('#change-locale').click()

    await retry(
      async () => {
        expect(await browser.eval('window.location.pathname')).toBe('/posts/a')
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.eval('window.location.hash')).toBe('#hash')
      },
      30000,
      1000
    )

    expect(await browser.elementByCss('#router-locale').text()).toBe('en')
    expect(await browser.elementByCss('#props-locale').text()).toBe('en')
  })

  it('should trigger hash change events', async () => {
    const browser = await webdriver(appPort, `/about#hash`)

    await retry(
      async () => {
        expect(await browser.eval('window.location.hash')).toBe('#hash')
      },
      30000,
      1000
    )

    await browser.elementByCss('#hash-change').click()

    await retry(
      async () => {
        expect(await browser.eval('window.hashChangeStart')).toBe('yes')
      },
      30000,
      1000
    )
    await retry(
      async () => {
        expect(await browser.eval('window.hashChangeComplete')).toBe('yes')
      },
      30000,
      1000
    )

    await retry(
      async () => {
        expect(await browser.eval('window.location.hash')).toBe('#newhash')
      },
      30000,
      1000
    )
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
