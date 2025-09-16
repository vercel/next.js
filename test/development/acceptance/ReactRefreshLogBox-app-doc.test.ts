import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import path from 'path'

const isRspack = process.env.NEXT_RSPACK !== undefined

describe('ReactRefreshLogBox _app _document', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  test('empty _app shows logbox', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([['pages/_app.js', ``]])
    )
    const { browser, session } = sandbox
    await expect(browser).toDisplayRedbox(`
     {
       "description": "The default export is not a React Component in page: "/_app"",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": null,
       "stack": [],
     }
    `)

    await session.patch(
      'pages/_app.js',
      outdent`
        function MyApp({ Component, pageProps }) {
          return <Component {...pageProps} />;
        }
        export default MyApp
      `
    )
    await session.assertNoRedbox()
  })

  test('empty _document shows logbox', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([['pages/_document.js', ``]])
    )
    const { browser, session } = sandbox

    await expect(browser).toDisplayRedbox(`
     {
       "description": "The default export is not a React Component in page: "/_document"",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": null,
       "stack": [],
     }
    `)

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
    await session.assertNoRedbox()
  })

  test('_app syntax error shows logbox', async () => {
    await using sandbox = await createSandbox(
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
    const { browser, session } = sandbox

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_app.js (2:10)
       Parsing ecmascript source code failed
       > 2 |   return <<Component {...pageProps} />;
           |          ^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_app.js
         × Module build failed:
         ╰─▶   × Error:   x Expression expected
               │    ,-[2:1]
               │  1 | function MyApp({ Component, pageProps }) {
               │  2 |   return <<Component {...pageProps} />;
               │    :          ^^
               │  3 | }
               │  4 | export default MyApp
               │    \`----
               │   x Expected ';', got '{'
               │    ,-[2:1]
               │  1 | function MyApp({ Component, pageProps }) {
               │  2 |   return <<Component {...pageProps} />;
               │    :                      ^
               │  3 | }
               │  4 | export default MyApp
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Expression expected",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_app.js
       Error:   x Expression expected
          ,-[2:1]
        1 | function MyApp({ Component, pageProps }) {
        2 |   return <<Component {...pageProps} />;
          :          ^^
        3 | }
        4 | export default MyApp
          \`----
         x Expected ';', got '{'
          ,-[2:1]
        1 | function MyApp({ Component, pageProps }) {
        2 |   return <<Component {...pageProps} />;
          :                      ^
        3 | }
        4 | export default MyApp
          \`----
       Caused by:
           Syntax Error",
         "stack": [],
       }
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
    await session.assertNoRedbox()
  })

  test('_document syntax error shows logbox', async () => {
    await using sandbox = await createSandbox(
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
    const { browser, session } = sandbox
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_document.js (3:36)
       Parsing ecmascript source code failed
       > 3 | class MyDocument extends Document {{
           |                                    ^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_document.js
         × Module build failed:
         ╰─▶   × Error:   x Unexpected token \`{\`. Expected identifier, string literal, numeric literal or [ for the computed key
               │    ,-[3:1]
               │  1 | import Document, { Html, Head, Main, NextScript } from 'next/document'
               │  2 |
               │  3 | class MyDocument extends Document {{
               │    :                                    ^
               │  4 |   static async getInitialProps(ctx) {
               │  5 |     const initialProps = await Document.getInitialProps(ctx)
               │  6 |     return { ...initialProps }
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Unexpected token \`{\`. Expected identifier, string literal, numeric literal or [ for the computed key",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_document.js
       Error:   x Unexpected token \`{\`. Expected identifier, string literal, numeric literal or [ for the computed key
          ,-[3:1]
        1 | import Document, { Html, Head, Main, NextScript } from 'next/document'
        2 |
        3 | class MyDocument extends Document {{
          :                                    ^
        4 |   static async getInitialProps(ctx) {
        5 |     const initialProps = await Document.getInitialProps(ctx)
        6 |     return { ...initialProps }
          \`----
       Caused by:
           Syntax Error",
         "stack": [],
       }
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
    await session.assertNoRedbox()
  })
})
