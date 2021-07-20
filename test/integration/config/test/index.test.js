/* eslint-env jest */

import cheerio from 'cheerio'
import { readFileSync, writeFileSync } from 'fs'
import {
  check,
  File,
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import fetch from 'node-fetch'
import { join } from 'path'

const context = {}
jest.setTimeout(1000 * 60 * 5)

describe('Configuration', () => {
  beforeAll(async () => {
    context.output = ''

    const handleOutput = (msg) => {
      context.output += msg
    }

    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort, {
      env: {
        NODE_OPTIONS: '--inspect',
      },
      onStdout: handleOutput,
      onStderr: handleOutput,
    })

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(context.appPort, '/next-config'),
      renderViaHTTP(context.appPort, '/build-id'),
      renderViaHTTP(context.appPort, '/webpack-css'),
      renderViaHTTP(context.appPort, '/module-only-component'),
    ])
  })

  afterAll(() => {
    killApp(context.server)
  })

  async function get$(path, query) {
    const html = await renderViaHTTP(context.appPort, path, query)
    return cheerio.load(html)
  }

  it('should log webpack version correctly', async () => {
    expect(context.output).toContain(
      `Using webpack 4. Reason: webpack5 flag is set to false in next.config.js`
    )
  })

  it('should disable X-Powered-By header support', async () => {
    const url = `http://localhost:${context.appPort}/`
    const header = (await fetch(url)).headers.get('X-Powered-By')
    expect(header).not.toBe('Next.js')
  })

  test('renders css imports', async () => {
    let browser
    try {
      browser = await webdriver(context.appPort, '/webpack-css')

      await check(
        () => browser.elementByCss('.hello-world').getComputedCss('font-size'),
        '100px'
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('renders non-js imports from node_modules', async () => {
    let browser
    try {
      browser = await webdriver(context.appPort, '/webpack-css')
      await check(
        () =>
          browser
            .elementByCss('.hello-world')
            .getComputedCss('background-color'),
        'rgba(0, 0, 255, 1)'
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('renders server config on the server only', async () => {
    const $ = await get$('/next-config')
    expect($('#server-only').text()).toBe('secret')
  })

  test('renders public config on the server only', async () => {
    const $ = await get$('/next-config')
    expect($('#server-and-client').text()).toBe('/static')
  })

  test('renders the build id in development mode', async () => {
    const $ = await get$('/build-id')
    expect($('#buildId').text()).toBe('development')
  })

  test('correctly imports a package that defines `module` but no `main` in package.json', async () => {
    const $ = await get$('/module-only-content')
    expect($('#messageInAPackage').text()).toBe('OK')
  })

  it('should have config available on the client', async () => {
    const browser = await webdriver(context.appPort, '/next-config')

    const serverText = await browser.elementByCss('#server-only').text()
    const serverClientText = await browser
      .elementByCss('#server-and-client')
      .text()
    const envValue = await browser.elementByCss('#env').text()

    expect(serverText).toBe('')
    expect(serverClientText).toBe('/static')
    expect(envValue).toBe('hello')
    await browser.close()
  })

  it('should update css styles using hmr', async () => {
    let browser
    try {
      browser = await webdriver(context.appPort, '/webpack-css')

      await check(async () => {
        const pTag = await browser.elementByCss('.hello-world')
        const initialFontSize = await pTag.getComputedCss('font-size')
        return initialFontSize
      }, '100px')

      const pagePath = join(
        __dirname,
        '../',
        'components',
        'hello-webpack-css.css'
      )

      const originalContent = readFileSync(pagePath, 'utf8')
      const editedContent = originalContent.replace('100px', '200px')

      // Change the page
      writeFileSync(pagePath, editedContent, 'utf8')

      try {
        // Check whether the this page has reloaded or not.
        await check(
          () =>
            browser.elementByCss('.hello-world').getComputedCss('font-size'),
          '200px'
        )
      } finally {
        // Finally is used so that we revert the content back to the original regardless of the test outcome
        // restore the about page content.
        writeFileSync(pagePath, originalContent, 'utf8')
        // This also make sure that the change is reverted when the test ends
        await check(
          () =>
            browser.elementByCss('.hello-world').getComputedCss('font-size'),
          '100px'
        )
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should update sass styles using hmr', async () => {
    const file = new File(
      join(__dirname, '../', 'components', 'hello-webpack-sass.scss')
    )
    let browser
    try {
      browser = await webdriver(context.appPort, '/webpack-css')
      await check(
        () => browser.elementByCss('.hello-world').getComputedCss('color'),
        'rgba(255, 255, 0, 1)'
      )

      try {
        file.replace('yellow', 'red')
        await check(
          () => browser.elementByCss('.hello-world').getComputedCss('color'),
          'rgba(255, 0, 0, 1)'
        )
      } finally {
        file.restore()
        await check(
          () => browser.elementByCss('.hello-world').getComputedCss('color'),
          'rgba(255, 255, 0, 1)'
        )
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
