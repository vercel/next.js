/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, launchApp, retry } from 'next-test-utils'

const appDir = join(__dirname, '../')
const appPage = join(appDir, 'pages/_app.js')
const indexPage = join(appDir, 'pages/index.js')
const documentPage = join(appDir, 'pages/_document.js')

let appPort
let app

describe('_app removal HMR', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should HMR when _app is removed', async () => {
    let indexContent = await fs.readFile(indexPage)
    try {
      const browser = await webdriver(appPort, '/')

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('custom _app')

      await fs.rename(appPage, appPage + '.bak')

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(
          html.includes('index page') && !html.includes('custom _app')
        ).toBeTruthy()
      })

      await fs.writeFile(
        indexPage,
        `
        export default function Page() {
          return <p>index page updated</p>
        }
      `
      )

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')

        expect(
          html.includes('index page updated') && !html.includes('custom _app')
        ).toBeTruthy()
      })

      await fs.rename(appPage + '.bak', appPage)

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')

        expect(
          html.includes('index page updated') && html.includes('custom _app')
        ).toBeTruthy()
      })
    } finally {
      await fs.writeFile(indexPage, indexContent)

      if (await fs.pathExists(appPage + '.bak')) {
        await fs.rename(appPage + '.bak', appPage)
      }
    }
  })

  it('should HMR when _document is removed', async () => {
    let indexContent = await fs.readFile(indexPage)
    try {
      const browser = await webdriver(appPort, '/')

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).toContain('custom _document')

      await fs.rename(documentPage, documentPage + '.bak')

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(
          html.includes('index page') && !html.includes('custom _document')
        ).toBeTruthy()
      })

      await fs.writeFile(
        indexPage,
        `
        export default function Page() {
          return <p>index page updated</p>
        }
      `
      )

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')

        expect(
          html.includes('index page updated') &&
            !html.includes('custom _document')
        ).toBeTruthy()
      })

      await fs.rename(documentPage + '.bak', documentPage)

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')

        expect(
          html.includes('index page updated') &&
            html.includes('custom _document')
        ).toBeTruthy()
      })
    } finally {
      await fs.writeFile(indexPage, indexContent)

      if (await fs.pathExists(documentPage + '.bak')) {
        await fs.rename(documentPage + '.bak', documentPage)
      }
    }
  })
})
