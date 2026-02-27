/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  getDeploymentId,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  retry,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort
let app

function runTests(mode: 'dev' | 'server') {
  it('should not optimize any image', async () => {
    const browser = await webdriver(appPort, '/')

    const dpl = getDeploymentId(appDir, mode === 'dev').getDeploymentIdQuery()
    const assetDpl = getDeploymentId(appDir, mode === 'dev').getAssetQuery()

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
      `/test.webp${dpl}`
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

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("external-image").scrollIntoView()`
      )
      expect(
        await browser.eval(
          `document.getElementById("external-image").currentSrc`
        )
      ).toBe('https://image-optimization-test.vercel.app/test.jpg')
    })

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("internal-image").scrollIntoView()`
      )
      expect(
        await browser.elementById('internal-image').getAttribute('src')
      ).toBe(`/test.png${dpl}`)
    })

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("static-image").scrollIntoView()`
      )
      expect(
        (await browser.elementById('static-image').getAttribute('src')).replace(
          /test\.[a-z0-9]+\.jpg/,
          'test.HASH.jpg'
        )
      ).toMatch('/_next/static/media/test.HASH.jpg' + assetDpl)
    })

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("external-image").scrollIntoView()`
      )
      expect(
        await browser.elementById('external-image').getAttribute('src')
      ).toBe('https://image-optimization-test.vercel.app/test.jpg')
    })

    await retry(async () => {
      await browser.eval(
        `window.scrollTo(0, 0); document.getElementById("eager-image").scrollIntoView()`
      )
      expect(await browser.elementById('eager-image').getAttribute('src')).toBe(
        `/test.webp${dpl}`
      )
    })

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

      runTests('dev')
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

      runTests('server')
    }
  )
})
