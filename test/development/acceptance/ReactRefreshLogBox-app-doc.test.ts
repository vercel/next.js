import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { describeVariants as describe } from 'next-test-utils'
import { outdent } from 'outdent'
import path from 'path'

describe.each(['default', 'turbo'])(
  'ReactRefreshLogBox _app _document %s',
  () => {
    const { next } = nextTestSetup({
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
      skipStart: true,
    })

    test('empty _app shows logbox', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([['pages/_app.js', ``]])
      )
      expect(await session.hasRedbox()).toBe(true)
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Error: The default export is not a React Component in page: "/_app""`
      )

      await session.patch(
        'pages/_app.js',
        outdent`
        function MyApp({ Component, pageProps }) {
          return <Component {...pageProps} />;
        }
        export default MyApp
      `
      )
      expect(await session.hasRedbox()).toBe(false)
      await cleanup()
    })

    test('empty _document shows logbox', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([['pages/_document.js', ``]])
      )
      expect(await session.hasRedbox()).toBe(true)
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Error: The default export is not a React Component in page: "/_document""`
      )

      await session.patch(
        'pages/_document.js',
        outdent`
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
      expect(await session.hasRedbox()).toBe(false)
      await cleanup()
    })

    test('_app syntax error shows logbox', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([
          [
            'pages/_app.js',
            outdent`
            function MyApp({ Component, pageProps }) {
              return <<Component {...pageProps} />;
            }
            export default MyApp
          `,
          ],
        ])
      )
      expect(await session.hasRedbox()).toBe(true)
      const content = await session.getRedboxSource()
      const source = next.normalizeTestDirContent(content)
      if (process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
          "./pages/_app.js:2:11
          Ecmascript file had an error
            1 | function MyApp({ Component, pageProps }) {
          > 2 |   return <<Component {...pageProps} />;
              |           ^
            3 | }
            4 | export default MyApp

          Expression expected"
        `)
      } else {
        expect(source).toMatchInlineSnapshot(`
                  "./pages/_app.js
                  Error: 
                    x Expression expected
                     ,-[TEST_DIR/pages/_app.js:1:1]
                   1 | function MyApp({ Component, pageProps }) {
                   2 |   return <<Component {...pageProps} />;
                     :           ^
                   3 | }
                   4 | export default MyApp
                     \`----

                    x Expression expected
                     ,-[TEST_DIR/pages/_app.js:1:1]
                   1 | function MyApp({ Component, pageProps }) {
                   2 |   return <<Component {...pageProps} />;
                     :            ^^^^^^^^^
                   3 | }
                   4 | export default MyApp
                     \`----

                  Caused by:
                      Syntax Error"
              `)
      }

      await session.patch(
        'pages/_app.js',
        outdent`
        function MyApp({ Component, pageProps }) {
          return <Component {...pageProps} />;
        }
        export default MyApp
      `
      )
      expect(await session.hasRedbox()).toBe(false)
      await cleanup()
    })

    test('_document syntax error shows logbox', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([
          [
            'pages/_document.js',
            outdent`
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
      expect(await session.hasRedbox()).toBe(true)
      const source = next.normalizeTestDirContent(
        await session.getRedboxSource()
      )
      if (process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
          "./pages/_document.js:3:36
          Ecmascript file had an error
            1 | import Document, { Html, Head, Main, NextScript } from 'next/document'
            2 |
          > 3 | class MyDocument extends Document {{
              |                                    ^
            4 |   static async getInitialProps(ctx) {
            5 |     const initialProps = await Document.getInitialProps(ctx)
            6 |     return { ...initialProps }

          Unexpected token \`{\`. Expected identifier, string literal, numeric literal or [ for the computed key"
        `)
      } else {
        expect(source).toMatchInlineSnapshot(`
                  "./pages/_document.js
                  Error: 
                    x Unexpected token \`{\`. Expected identifier, string literal, numeric literal or [ for the computed key
                     ,-[TEST_DIR/pages/_document.js:1:1]
                   1 | import Document, { Html, Head, Main, NextScript } from 'next/document'
                   2 | 
                   3 | class MyDocument extends Document {{
                     :                                    ^
                   4 |   static async getInitialProps(ctx) {
                   5 |     const initialProps = await Document.getInitialProps(ctx)
                   6 |     return { ...initialProps }
                     \`----

                  Caused by:
                      Syntax Error"
              `)
      }

      await session.patch(
        'pages/_document.js',
        outdent`
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
      expect(await session.hasRedbox()).toBe(false)
      await cleanup()
    })
  }
)
