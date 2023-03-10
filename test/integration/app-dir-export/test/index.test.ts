/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import {
  File,
  nextBuild,
  nextExport,
  startStaticServer,
  stopApp,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const distDir = join(__dirname, '.next')
const exportDir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))
let app: any
let appPort: number

describe('app dir with next export', () => {
  beforeAll(async () => {
    await fs.remove(distDir)
    await fs.remove(exportDir)
    await nextBuild(appDir)
    await nextExport(appDir, { outdir: exportDir })
    app = await startStaticServer(exportDir)
    appPort = app.address().port
  })
  afterAll(async () => {
    await stopApp(app)
  })

  it.each([{ trailingSlash: false }, { trailingSlash: true }])(
    "should correctly navigate between pages with trailingSlash '$trailingSlash'",
    async ({ trailingSlash }) => {
      nextConfig.replace('// replace-me', `trailingSlash: ${trailingSlash},`)
      try {
        const child = (n: number) => `li:nth-child(${n}) a`
        const browser = await webdriver(appPort, '/')
        expect(await browser.elementByCss('h1').text()).toBe('Home')
        expect(await browser.elementByCss(child(1)).text()).toBe(
          'another no trailingslash'
        )
        await browser.elementByCss(child(1)).click()

        expect(await browser.elementByCss('h1').text()).toBe('Another')
        expect(await browser.elementByCss(child(1)).text()).toBe(
          'Visit the home page'
        )
        await browser.elementByCss(child(1)).click()

        expect(await browser.elementByCss('h1').text()).toBe('Home')
        expect(await browser.elementByCss(child(2)).text()).toBe(
          'another has trailingslash'
        )
        await browser.elementByCss(child(2)).click()

        expect(await browser.elementByCss('h1').text()).toBe('Another')
        expect(await browser.elementByCss(child(1)).text()).toBe(
          'Visit the home page'
        )
        await browser.elementByCss(child(1)).click()

        expect(await browser.elementByCss('h1').text()).toBe('Home')
        expect(await browser.elementByCss(child(3)).text()).toBe(
          'another first page'
        )
        await browser.elementByCss(child(3)).click()

        expect(await browser.elementByCss('h1').text()).toBe('first')
        expect(await browser.elementByCss(child(1)).text()).toBe(
          'Visit another page'
        )
        await browser.elementByCss(child(1)).click()

        expect(await browser.elementByCss('h1').text()).toBe('Another')
        expect(await browser.elementByCss(child(4)).text()).toBe(
          'another second page'
        )
        await browser.elementByCss(child(4)).click()

        expect(await browser.elementByCss('h1').text()).toBe('second')
        expect(await browser.elementByCss(child(1)).text()).toBe(
          'Visit another page'
        )
        await browser.elementByCss(child(1)).click()
      } finally {
        nextConfig.restore()
      }
    }
  )
})
