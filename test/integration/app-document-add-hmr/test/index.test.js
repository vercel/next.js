/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, launchApp, check } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const appPage = join(appDir, 'pages/_app.js')
const indexPage = join(appDir, 'pages/index.js')
const documentPage = join(appDir, 'pages/_document.js')

let appPort
let app

describe('_app/_document add HMR', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should HMR when _app is added', async () => {
    let indexContent = await fs.readFile(indexPage)
    try {
      const browser = await webdriver(appPort, '/')

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).not.toContain('custom _app')
      expect(html).toContain('index page')

      await fs.writeFile(
        appPage,
        `
        export default function MyApp({ Component, pageProps }) {
          return (
            <>
              <p>custom _app</p>
              <Component {...pageProps} />
            </>
          )
        }
      `
      )

      await check(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        return html.includes('custom _app') && html.includes('index page')
          ? 'success'
          : html
      }, 'success')
    } finally {
      await fs.writeFile(indexPage, indexContent)
      await fs.remove(appPage)
    }
  })

  it('should HMR when _document is added', async () => {
    let indexContent = await fs.readFile(indexPage)
    try {
      const browser = await webdriver(appPort, '/')

      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).not.toContain('custom _document')
      expect(html).toContain('index page')

      await fs.writeFile(
        documentPage,
        `
        import Document, { Html, Head, Main, NextScript } from 'next/document'

        class MyDocument extends Document {
          static async getInitialProps(ctx) {
            const initialProps = await Document.getInitialProps(ctx)
            return { ...initialProps }
          }

          render() {
            return (
              <Html>
                <Head />
                <body>
                  <p>custom _document</p>
                  <Main />
                  <NextScript />
                </body>
              </Html>
            )
          }
        }

        export default MyDocument

      `
      )

      await check(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        return html.includes('custom _document') && html.includes('index page')
          ? 'success'
          : html
      }, 'success')
    } finally {
      await fs.writeFile(indexPage, indexContent)
      await fs.remove(documentPage)
    }
  })
})
