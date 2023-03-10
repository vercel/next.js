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
  waitFor,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const distDir = join(__dirname, '.next')
const exportDir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))
const slugPage = new File(join(appDir, 'app/another/[slug]/page.js'))
const delay = 100

describe('app dir with next export', () => {
  it.each([{ trailingSlash: false }, { trailingSlash: true }])(
    "should correctly navigate between pages with trailingSlash '$trailingSlash'",
    async ({ trailingSlash }) => {
      nextConfig.replace('// replace-me', `trailingSlash: ${trailingSlash},`)
      await fs.remove(distDir)
      await fs.remove(exportDir)
      await nextBuild(appDir)
      await nextExport(appDir, { outdir: exportDir })
      const app = await startStaticServer(exportDir)
      const address = app.address()
      const appPort = typeof address !== 'string' ? address.port : 3000

      try {
        const a = (n: number) => `li:nth-child(${n}) a`
        const browser = await webdriver(appPort, '/')
        expect(await browser.elementByCss('h1').text()).toBe('Home')
        expect(await browser.elementByCss(a(1)).text()).toBe(
          'another no trailingslash'
        )
        await browser.elementByCss(a(1)).click()
        await waitFor(delay)

        expect(await browser.elementByCss('h1').text()).toBe('Another')
        expect(await browser.elementByCss(a(1)).text()).toBe(
          'Visit the home page'
        )
        await browser.elementByCss(a(1)).click()
        await waitFor(delay)

        expect(await browser.elementByCss('h1').text()).toBe('Home')
        expect(await browser.elementByCss(a(2)).text()).toBe(
          'another has trailingslash'
        )
        await browser.elementByCss(a(2)).click()
        await waitFor(delay)

        expect(await browser.elementByCss('h1').text()).toBe('Another')
        expect(await browser.elementByCss(a(1)).text()).toBe(
          'Visit the home page'
        )
        await browser.elementByCss(a(1)).click()
        await waitFor(delay)

        expect(await browser.elementByCss('h1').text()).toBe('Home')
        expect(await browser.elementByCss(a(3)).text()).toBe(
          'another first page'
        )
        await browser.elementByCss(a(3)).click()
        await waitFor(delay)

        expect(await browser.elementByCss('h1').text()).toBe('first')
        expect(await browser.elementByCss(a(1)).text()).toBe(
          'Visit another page'
        )
        await browser.elementByCss(a(1)).click()
        await waitFor(delay)

        expect(await browser.elementByCss('h1').text()).toBe('Another')
        expect(await browser.elementByCss(a(4)).text()).toBe(
          'another second page'
        )
        await browser.elementByCss(a(4)).click()
        await waitFor(delay)

        expect(await browser.elementByCss('h1').text()).toBe('second')
        expect(await browser.elementByCss(a(1)).text()).toBe(
          'Visit another page'
        )
        await browser.elementByCss(a(1)).click()
        await waitFor(delay)
      } finally {
        await stopApp(app)
        nextConfig.restore()
        slugPage.restore()
      }
    }
  )
})
