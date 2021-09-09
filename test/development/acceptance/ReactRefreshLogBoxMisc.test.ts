import { sandbox } from './helpers'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('ReactRefreshLogBox', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {},
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  test('<Link> with multiple children', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      `
        import Link from 'next/link'

        export default function Index() {
          return (
            <Link href="/">
              <p>One</p>
              <p>Two</p>
            </Link>
          )
        }
      `
    )

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Error: Multiple children were passed to <Link> with \`href\` of \`/\` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children"`
    )
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatch('https://nextjs.org/docs/messages/link-multiple-children')

    await cleanup()
  })

  test('<Link> component props errors', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      `
        import Link from 'next/link'

        export default function Hello() {
          return <Link />
        }
      `
    )

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Error: Failed prop type: The prop \`href\` expects a \`string\` or \`object\` in \`<Link>\`, but got \`undefined\` instead."`
    )

    await session.patch(
      'index.js',
      `
        import Link from 'next/link'

        export default function Hello() {
          return <Link href="/">Abc</Link>
        }
      `
    )
    expect(await session.hasRedbox()).toBe(false)

    await session.patch(
      'index.js',
      `
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href="/"
              as="/"
              replace={false}
              scroll={false}
              shallow={false}
              passHref={false}
              prefetch={false}
            >
              Abc
            </Link>
          )
        }
      `
    )
    expect(await session.hasRedbox()).toBe(false)

    await session.patch(
      'index.js',
      `
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href="/"
              as="/"
              replace={true}
              scroll={true}
              shallow={true}
              passHref={true}
              prefetch={true}
            >
              Abc
            </Link>
          )
        }
      `
    )
    expect(await session.hasRedbox()).toBe(false)

    await session.patch(
      'index.js',
      `
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href="/"
              as="/"
              replace={undefined}
              scroll={undefined}
              shallow={undefined}
              passHref={undefined}
              prefetch={undefined}
            >
              Abc
            </Link>
          )
        }
      `
    )
    expect(await session.hasRedbox()).toBe(false)

    await session.patch(
      'index.js',
      `
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href="/"
              as="/"
              replace={undefined}
              scroll={'oops'}
              shallow={undefined}
              passHref={undefined}
              prefetch={undefined}
            >
              Abc
            </Link>
          )
        }
      `
    )
    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxDescription()).toMatchSnapshot()

    await session.patch(
      'index.js',
      `
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href={false}
              as="/"
              replace={undefined}
              scroll={'oops'}
              shallow={undefined}
              passHref={undefined}
              prefetch={undefined}
            >
              Abc
            </Link>
          )
        }
      `
    )
    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxDescription()).toMatchSnapshot()

    await cleanup()
  })

  test('_app top level error shows logbox', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'pages/_app.js',
          `
            throw new Error("test");
            function MyApp({ Component, pageProps }) {
              return <Component {...pageProps} />;
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
    expect(await session.hasRedbox()).toBe(false)
    await cleanup()
  })

  test('_document top level error shows logbox', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'pages/_document.js',
          `
            import Document, { Html, Head, Main, NextScript } from 'next/document'

            throw new Error("test");

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
    expect(await session.hasRedbox()).toBe(false)
    await cleanup()
  })

  // TODO: investigate why this test is so flakey
  test.skip('server-side only compilation errors', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'pages/index.js',
      `
        import myLibrary from 'my-non-existent-library'
        export async function getStaticProps() {
          return {
            props: {
              result: myLibrary()
            }
          }
        }
        export default function Hello(props) {
          return <h1>{props.result}</h1>
        }
      `
    )

    expect(await session.hasRedbox(true)).toBe(true)
    await cleanup()
  })

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
    expect(await session.hasRedbox()).toBe(false)
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
    expect(await session.hasRedbox()).toBe(false)
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
    expect(await session.hasRedbox()).toBe(false)
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
    expect(await session.hasRedbox()).toBe(false)
    await cleanup()
  })

  // Module trace is only available with webpack 5
  if (!process.env.NEXT_PRIVATE_TEST_WEBPACK4_MODE) {
    test('Node.js builtins', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([
          [
            'node_modules/my-package/index.js',
            `
            const dns = require('dns')
            module.exports = dns
          `,
          ],
          [
            'node_modules/my-package/package.json',
            `
            {
              "name": "my-package",
              "version": "0.0.1"
            }
          `,
          ],
        ])
      )

      await session.patch(
        'index.js',
        `
        import pkg from 'my-package'

        export default function Hello() {
          return (pkg ? <h1>Package loaded</h1> : <h1>Package did not load</h1>)
        }
      `
      )
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchSnapshot()

      await cleanup()
    })
  }
})
