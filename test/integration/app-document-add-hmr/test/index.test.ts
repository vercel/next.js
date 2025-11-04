/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import webdriver from 'next-webdriver'
import { killApp, findPort, launchApp, check } from 'next-test-utils'

const appDir = join(__dirname, '../')
const appPage = join(appDir, 'pages/_app.js')
const documentPage = join(appDir, 'pages/_document.js')

let appPort
let app

describe('_app/_document add HMR', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  // TODO: figure out why test fails.
  it.skip('should HMR when _app is added', async () => {
    const browser = await webdriver(appPort, '/')
    try {
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
      await fs.remove(appPage)
      await check(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        return !html.includes('custom _app') && html.includes('index page')
          ? 'restored'
          : html
      }, 'restored')
    }
  })

  // TODO: Figure out why test fails.
  it.skip('should HMR when _document is added', async () => {
    const browser = await webdriver(appPort, '/')
    try {
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
      await fs.remove(documentPage)
      await check(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        return !html.includes('custom _document') && html.includes('index page')
          ? 'restored'
          : html
      }, 'restored')
    }
  })
})
