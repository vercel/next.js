import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('_app/_document add HMR', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // TODO: figure out why test fails.
  it.skip('should HMR when _app is added', async () => {
    const browser = await next.browser('/')
    try {
      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).not.toContain('custom _app')
      expect(html).toContain('index page')

      await next.patchFile(
        'pages/_app.js',
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

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('custom _app')
        expect(html).toContain('index page')
      })
    } finally {
      await next.deleteFile('pages/_app.js')
      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).not.toContain('custom _app')
        expect(html).toContain('index page')
      })
    }
  })

  // TODO: Figure out why test fails.
  it.skip('should HMR when _document is added', async () => {
    const browser = await next.browser('/')
    try {
      const html = await browser.eval('document.documentElement.innerHTML')
      expect(html).not.toContain('custom _document')
      expect(html).toContain('index page')

      await next.patchFile(
        'pages/_document.js',
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

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).toContain('custom _document')
        expect(html).toContain('index page')
      })
    } finally {
      await next.deleteFile('pages/_document.js')
      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        expect(html).not.toContain('custom _document')
        expect(html).toContain('index page')
      })
    }
  })
})
