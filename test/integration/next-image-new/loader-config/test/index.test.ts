/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort
let app

function runTests(url: string) {
  it('should work with loaderFile config', async () => {
    const browser = await webdriver(appPort, url)
    expect(await browser.elementById('img1').getAttribute('src')).toBe(
      '/logo.png#w:828,q:50'
    )
    expect(await browser.elementById('img1').getAttribute('srcset')).toBe(
      '/logo.png#w:640,q:50 1x, /logo.png#w:828,q:50 2x'
    )
  })

  it('should work with loader prop', async () => {
    const browser = await webdriver(appPort, url)
    expect(await browser.elementById('img2').getAttribute('src')).toBe(
      '/logo.png?wid=640&qual=35'
    )
    expect(await browser.elementById('img2').getAttribute('srcset')).toBe(
      '/logo.png?wid=256&qual=35 1x, /logo.png?wid=640&qual=35 2x'
    )
  })
}

describe('Image Loader Config new', () => {
  describe('development mode - component', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })
    runTests('/')
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
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
  describe('development mode - getImageProps', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })
    runTests('/get-img-props')
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
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
