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

function runTests(url: string) {
  it('should not optimize any image', async () => {
    const browser = await webdriver(appPort, url)
    expect(
      await browser.elementById('internal-image').getAttribute('src')
    ).toBe('/test.png')
    expect(
      await browser.elementById('static-image').getAttribute('src')
    ).toMatch(/test(.*)jpg/)
    expect(
      await browser.elementById('external-image').getAttribute('src')
    ).toBe('https://image-optimization-test.vercel.app/test.jpg')
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

    await browser.eval(
      `document.getElementById("internal-image").scrollIntoView({behavior: "smooth"})`
    )
    await browser.eval(
      `document.getElementById("static-image").scrollIntoView({behavior: "smooth"})`
    )
    await browser.eval(
      `document.getElementById("external-image").scrollIntoView({behavior: "smooth"})`
    )
    await browser.eval(
      `document.getElementById("eager-image").scrollIntoView({behavior: "smooth"})`
    )

    await check(
      () =>
        browser.eval(`document.getElementById("external-image").currentSrc`),
      'https://image-optimization-test.vercel.app/test.jpg'
    )

    expect(
      await browser.elementById('internal-image').getAttribute('src')
    ).toBe('/test.png')
    expect(
      await browser.elementById('static-image').getAttribute('src')
    ).toMatch(/test(.*)jpg/)
    expect(
      await browser.elementById('external-image').getAttribute('src')
    ).toBe('https://image-optimization-test.vercel.app/test.jpg')
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
  })
}

describe('Unoptimized Image Tests', () => {
  describe('dev mode - component', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests('/')
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)(
    'production mode - component',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('/')
    }
  )
  describe('dev mode - getImageProps', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests('/get-img-props')
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)(
    'production mode - getImageProps',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('/get-img-props')
    }
  )
})
