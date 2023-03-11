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

async function runTests({
  trailingSlash,
  dynamic,
}: {
  trailingSlash?: boolean
  dynamic?: string
}) {
  if (trailingSlash) {
    nextConfig.replace(
      'trailingSlash: true,',
      `trailingSlash: ${trailingSlash},`
    )
  }
  if (dynamic) {
    slugPage.replace(
      `const dynamic = 'force-static'`,
      `const dynamic = '${dynamic}'`
    )
  }
  await fs.remove(distDir)
  await fs.remove(exportDir)
  await nextBuild(appDir)
  await nextExport(appDir, { outdir: exportDir })
  const app = await startStaticServer(exportDir)
  const address = app.address()
  const appPort = typeof address !== 'string' ? address.port : 3000

  try {
    const a = (n: number) => `li:nth-child(${n}) a`
    console.log('[navigate]')
    const browser = await webdriver(appPort, '/')
    expect(await browser.elementByCss('h1').text()).toBe('Home')
    expect(await browser.elementByCss(a(1)).text()).toBe(
      'another no trailingslash'
    )
    await browser.elementByCss(a(1)).click()
    await waitFor(delay)

    expect(await browser.elementByCss('h1').text()).toBe('Another')
    expect(await browser.elementByCss(a(1)).text()).toBe('Visit the home page')
    await browser.elementByCss(a(1)).click()
    await waitFor(delay)

    expect(await browser.elementByCss('h1').text()).toBe('Home')
    expect(await browser.elementByCss(a(2)).text()).toBe(
      'another has trailingslash'
    )
    await browser.elementByCss(a(2)).click()
    await waitFor(delay)

    expect(await browser.elementByCss('h1').text()).toBe('Another')
    expect(await browser.elementByCss(a(1)).text()).toBe('Visit the home page')
    await browser.elementByCss(a(1)).click()
    await waitFor(delay)

    expect(await browser.elementByCss('h1').text()).toBe('Home')
    expect(await browser.elementByCss(a(3)).text()).toBe('another first page')
    await browser.elementByCss(a(3)).click()
    await waitFor(delay)

    expect(await browser.elementByCss('h1').text()).toBe('first')
    expect(await browser.elementByCss(a(1)).text()).toBe('Visit another page')
    await browser.elementByCss(a(1)).click()
    await waitFor(delay)

    expect(await browser.elementByCss('h1').text()).toBe('Another')
    expect(await browser.elementByCss(a(4)).text()).toBe('another second page')
    await browser.elementByCss(a(4)).click()
    await waitFor(delay)

    expect(await browser.elementByCss('h1').text()).toBe('second')
    expect(await browser.elementByCss(a(1)).text()).toBe('Visit another page')
    await browser.elementByCss(a(1)).click()
    await waitFor(delay)
  } finally {
    await stopApp(app)
    nextConfig.restore()
    slugPage.restore()
  }
}

describe('app dir with next export', () => {
  it.each([{ trailingSlash: false }, { trailingSlash: true }])(
    "should work with trailingSlash '$trailingSlash'",
    async ({ trailingSlash }) => {
      await runTests({ trailingSlash })
    }
  )
  it.each([
    { dynamic: 'auto' },
    { dynamic: 'error' },
    { dynamic: 'force-static' },
  ])("should work with dynamic '$dynamic'", async ({ dynamic }) => {
    await runTests({ dynamic })
  })
  it.each([{ dynamic: 'force-dynamic' }])(
    "should throw with dynamic '$dynamic'",
    async ({ dynamic }) => {
      expect('todo not implemented yet').toBe('todo not implemented yet')
    }
  )
})
