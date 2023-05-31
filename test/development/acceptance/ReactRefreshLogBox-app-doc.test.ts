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
      expect(
        next.normalizeTestDirContent(await session.getRedboxSource())
      ).toMatchInlineSnapshot(
        next.normalizeSnapshot(`
        "./pages/_app.js
        Error: 
          x Expression expected
           ,-[TEST_DIR/pages/_app.js:1:1]
         1 | 
         2 |             function MyApp({ Component, pageProps }) {
         3 |               return <<Component {...pageProps} />;
           :                       ^
         4 |             }
         5 |             export default MyApp
         6 |           
           \`----

          x Expression expected
           ,-[TEST_DIR/pages/_app.js:1:1]
         1 | 
         2 |             function MyApp({ Component, pageProps }) {
         3 |               return <<Component {...pageProps} />;
           :                        ^^^^^^^^^
         4 |             }
         5 |             export default MyApp
         6 |           
           \`----

        Caused by:
            Syntax Error"
      `)
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
      expect(
        next.normalizeTestDirContent(await session.getRedboxSource())
      ).toMatchInlineSnapshot(
        next.normalizeSnapshot(`
        "./pages/_document.js
        Error: 
          x Unexpected token \`{\`. Expected identifier, string literal, numeric literal or [ for the computed key
           ,-[TEST_DIR/pages/_document.js:1:1]
         1 | 
         2 |             import Document, { Html, Head, Main, NextScript } from 'next/document'
         3 | 
         4 |             class MyDocument extends Document {{
           :                                                ^
         5 |               static async getInitialProps(ctx) {
         6 |                 const initialProps = await Document.getInitialProps(ctx)
         7 |                 return { ...initialProps }
           \`----

        Caused by:
            Syntax Error"
      `)
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
  })
}
