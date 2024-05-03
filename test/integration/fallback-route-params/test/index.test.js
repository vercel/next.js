/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP,
  launchApp,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app

const runTests = () => {
  it('should have correct fallback query (skeleton)', async () => {
    const html = await renderViaHTTP(appPort, '/first')
    const $ = cheerio.load(html)
    const { query } = JSON.parse($('#__NEXT_DATA__').text())
    expect(query).toEqual({})
  })

  it('should have correct fallback query (hydration)', async () => {
    const browser = await webdriver(appPort, '/second')
    const initialSlug = await browser.eval(() => window.initialSlug)
    expect(initialSlug).toBeFalsy()

    await browser.waitForElementByCss('#query')

    const hydratedQuery = JSON.parse(
      await browser.elementByCss('#query').text()
    )
    expect(hydratedQuery).toEqual({ slug: 'second' })
  })
}

describe('Fallback Dynamic Route Params', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        await fs.remove(join(appDir, '.next'))
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
        await fs.remove(join(appDir, '.next'))
        await nextBuild(appDir, [])
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
