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

function runTests() {
  it('should not optimize any image', async () => {
    const browser = await webdriver(appPort, '/')

    expect(
      await browser.elementById('internal-image').getAttribute('src')
    ).toMatch('data:')
    expect(
      await browser.elementById('static-image').getAttribute('src')
    ).toMatch('data:')
    expect(
      await browser.elementById('external-image').getAttribute('src')
    ).toMatch('data:')
    expect(await browser.elementById('eager-image').getAttribute('src')).toBe(
      '/test.webp'
    )

    expect(
      await browser.elementById('internal-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('static-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('external-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('eager-image').getAttribute('srcset')
    ).toBeNull()

    await check(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("external-image").scrollIntoView()`
      )
      return browser.eval(
        `document.getElementById("external-image").currentSrc`
      )
    }, 'https://image-optimization-test.vercel.app/test.jpg')

    await check(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("internal-image").scrollIntoView()`
      )
      return browser.elementById('internal-image').getAttribute('src')
    }, '/test.png')

    await check(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("static-image").scrollIntoView()`
      )
      return browser.elementById('static-image').getAttribute('src')
    }, /test(.*)jpg/)

    await check(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("external-image").scrollIntoView()`
      )
      return browser.elementById('external-image').getAttribute('src')
    }, 'https://image-optimization-test.vercel.app/test.jpg')

    await check(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("eager-image").scrollIntoView()`
      )
      return browser.elementById('eager-image').getAttribute('src')
    }, '/test.webp')

    expect(
      await browser.elementById('internal-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('static-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('external-image').getAttribute('srcset')
    ).toBeNull()
    expect(
      await browser.elementById('eager-image').getAttribute('srcset')
    ).toBeNull()
  })
}

describe('Unoptimized Image Tests', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

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
      afterAll(async () => {
        await killApp(app)
      })

      runTests()
    }
  )
})
