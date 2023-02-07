import { sandbox } from './helpers'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { getSnapshotTestDescribe } from 'next-test-utils'

for (const variant of ['default', 'turbo']) {
  getSnapshotTestDescribe(variant)(`ReactRefreshLogBox ${variant}`, () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {},
        skipStart: true,
      })
    })
    afterAll(() => next.destroy())

    test('empty _app shows logbox', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([
          [
            'pages/_app.js',
            `

          `,
          ],
        ])
      )
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Error: The default export is not a React Component in page: \\"/_app\\""`
      )

      await session.patch(
        'pages/_app.js',
        `
        function MyApp({ Component, pageProps }) {
          return <Component {...pageProps} />;
        }
        export default MyApp
      `
      )
      expect(await session.hasRedbox(false)).toBe(false)
      await cleanup()
    })

    test('empty _document shows logbox', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([
          [
            'pages/_document.js',
            `

          `,
          ],
        ])
      )
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Error: The default export is not a React Component in page: \\"/_document\\""`
      )

      await session.patch(
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
      expect(await session.hasRedbox(false)).toBe(false)
      await cleanup()
    })

    test('_app syntax error shows logbox', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([
          [
            'pages/_app.js',
            `
            function MyApp({ Component, pageProps }) {
              return <<Component {...pageProps} />;
            }
            export default MyApp
          `,
          ],
        ])
      )
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchSnapshot()

      await session.patch(
        'pages/_app.js',
        `
        function MyApp({ Component, pageProps }) {
          return <Component {...pageProps} />;
        }
        export default MyApp
      `
      )
      expect(await session.hasRedbox(false)).toBe(false)
      await cleanup()
    })

    test('_document syntax error shows logbox', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([
          [
            'pages/_document.js',
            `
            import Document, { Html, Head, Main, NextScript } from 'next/document'

            class MyDocument extends Document {{
              static async getInitialProps(ctx) {
                const initialProps = await Document.getInitialProps(ctx)
                return { ...initialProps }
              }

              render() {
                return (
                  <Html>
                    <Head />
                    <body>
                      <Main />
                      <NextScript />
                    </body>
                  </Html>
                )
              }
            }

            export default MyDocument
          `,
          ],
        ])
      )
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchSnapshot()

      await session.patch(
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
      expect(await session.hasRedbox(false)).toBe(false)
      await cleanup()
    })
  })
}
