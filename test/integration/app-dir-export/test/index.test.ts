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

  describe('trailingSlash true', () => {
    beforeAll(async () => {
      nextConfig.replace('// replace-me', 'trailingSlash: true,')
    })
    afterAll(async () => {
      nextConfig.restore()
    })
    it('should correctly navigate between pages', async () => {
      const browser = await webdriver(appPort, '/')
      expect(await browser.elementByCss('h1').text()).toBe('Home')
      expect(await browser.elementByCss('a').text()).toBe(
        'Visit without trailingslash'
      )
      await browser.elementByCss('a').click()
      expect(await browser.elementByCss('h1').text()).toBe('Another')
      expect(await browser.elementByCss('a').text()).toBe('Visit the home page')
      await browser.elementByCss('a').click()
      expect(await browser.elementByCss('h1').text()).toBe('Home')
      expect(await browser.elementByCss('a:last-of-type').text()).toBe(
        'Visit with trailingslash'
      )
      await browser.elementByCss('a:last-of-type').click()
      expect(await browser.elementByCss('h1').text()).toBe('Another')
      expect(await browser.elementByCss('a').text()).toBe('Visit the home page')
    })
  })
  describe('trailingSlash false', () => {
    beforeAll(async () => {
      nextConfig.replace('// replace-me', 'trailingSlash: false,')
    })
    afterAll(async () => {
      nextConfig.restore()
    })
    it('should correctly navigate between pages', async () => {
      const browser = await webdriver(appPort, '/')
      expect(await browser.elementByCss('h1').text()).toBe('Home')
      expect(await browser.elementByCss('a').text()).toBe(
        'Visit without trailingslash'
      )
      await browser.elementByCss('a').click()
      expect(await browser.elementByCss('h1').text()).toBe('Another')
      expect(await browser.elementByCss('a').text()).toBe('Visit the home page')
      await browser.elementByCss('a').click()
      expect(await browser.elementByCss('h1').text()).toBe('Home')
      expect(await browser.elementByCss('a:last-of-type').text()).toBe(
        'Visit with trailingslash'
      )
      await browser.elementByCss('a:last-of-type').click()
      expect(await browser.elementByCss('h1').text()).toBe('Another')
      expect(await browser.elementByCss('a').text()).toBe('Visit the home page')
    })
  })
})
