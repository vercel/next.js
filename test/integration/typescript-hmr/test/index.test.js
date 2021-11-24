/* eslint-env jest */

import fs from 'fs-extra'
import {
  check,
  findPort,
  getBrowserBodyText,
  getRedboxHeader,
  killApp,
  launchApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')
let appPort
let app

describe('TypeScript HMR', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      env: {
        __NEXT_TEST_WITH_DEVTOOL: 1,
        // Events can be finicky in CI. This switches to a more reliable
        // polling method.
        CHOKIDAR_USEPOLLING: 'true',
        CHOKIDAR_INTERVAL: 500,
      },
    })
  })
  afterAll(() => killApp(app))

  describe('delete a page and add it back', () => {
    it('should detect the changes to typescript pages and display it', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/hello')
        await check(() => getBrowserBodyText(browser), /Hello World/)

        const pagePath = join(appDir, 'pages/hello.tsx')
        const originalContent = await fs.readFile(pagePath, 'utf8')
        const editedContent = originalContent.replace('Hello', 'COOL page')

        // change the content
        await fs.writeFile(pagePath, editedContent, 'utf8')
        await check(() => getBrowserBodyText(browser), /COOL page/)

        // add the original content
        await fs.writeFile(pagePath, originalContent, 'utf8')
        await check(() => getBrowserBodyText(browser), /Hello World/)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  // old behavior:
  it.skip('should recover from a type error', async () => {
    let browser
    const pagePath = join(appDir, 'pages/type-error-recover.tsx')
    const origContent = await fs.readFile(pagePath, 'utf8')
    try {
      browser = await webdriver(appPort, '/type-error-recover')
      const errContent = origContent.replace('() =>', '(): boolean =>')

      await fs.writeFile(pagePath, errContent)
      await check(
        () => getRedboxHeader(browser),
        /Type 'Element' is not assignable to type 'boolean'/
      )

      await fs.writeFile(pagePath, origContent)
      await check(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        return html.match(/iframe/) ? 'fail' : 'success'
      }, /success/)
    } finally {
      if (browser) browser.close()
      await fs.writeFile(pagePath, origContent)
    }
  })

  it('should ignore type errors in development', async () => {
    let browser
    const pagePath = join(appDir, 'pages/type-error-recover.tsx')
    const origContent = await fs.readFile(pagePath, 'utf8')
    try {
      browser = await webdriver(appPort, '/type-error-recover')
      const errContent = origContent.replace(
        '() => <p>Hello world</p>',
        '(): boolean => <p>hello with error</p>'
      )
      await fs.writeFile(pagePath, errContent)
      const res = await check(
        async () => {
          const html = await browser.eval(
            'document.querySelector("p").innerText'
          )
          return html.match(/hello with error/) ? 'success' : 'fail'
        },
        /success/,
        false
      )

      expect(res).toBe(true)
    } finally {
      if (browser) browser.close()
      await fs.writeFile(pagePath, origContent)
    }
  })
})
