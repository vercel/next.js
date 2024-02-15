import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { describeVariants as describe } from 'next-test-utils'
import { outdent } from 'outdent'
import path from 'path'

describe.each(['default', 'turbo'])('ReactRefreshLogBox %s', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  // Module trace is only available with webpack 5
  test('Node.js builtins', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'node_modules/my-package/index.js',
          outdent`
            const dns = require('dns')
            module.exports = dns
          `,
        ],
        [
          'node_modules/my-package/package.json',
          outdent`
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
      outdent`
        import pkg from 'my-package'

        export default function Hello() {
          return (pkg ? <h1>Package loaded</h1> : <h1>Package did not load</h1>)
        }
      `
    )
    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(
      process.env.TURBOPACK
        ? `
    "./node_modules/my-package/index.js:1:13
    Module not found: Can't resolve 'dns'
    > 1 | const dns = require('dns')
        |             ^^^^^^^^^^^^^^
      2 | module.exports = dns

    https://nextjs.org/docs/messages/module-not-found"
  `
        : `
  "./node_modules/my-package/index.js:1:1
  Module not found: Can't resolve 'dns'

  https://nextjs.org/docs/messages/module-not-found

  Import trace for requested module:
  ./index.js
  ./pages/index.js"
`
    )

    await cleanup()
  })

  test('Module not found', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      outdent`
        import Comp from 'b'

        export default function Oops() {
          return (
            <div>
              <Comp>lol</Comp>
            </div>
          )
        }
      `
    )

    expect(await session.hasRedbox()).toBe(true)

    const source = await session.getRedboxSource()
    if (process.env.TURBOPACK) {
      expect(source).toMatchInlineSnapshot(`
        "./index.js:1:1
        Module not found: Can't resolve 'b'
        > 1 | import Comp from 'b'
            | ^^^^^^^^^^^^^^^^^^^^
          2 |
          3 | export default function Oops() {
          4 |   return (

        https://nextjs.org/docs/messages/module-not-found"
      `)
    } else {
      expect(source).toMatchInlineSnapshot(`
        "./index.js:1:1
        Module not found: Can't resolve 'b'
        > 1 | import Comp from 'b'
            | ^
          2 |
          3 | export default function Oops() {
          4 |   return (

        https://nextjs.org/docs/messages/module-not-found

        Import trace for requested module:
        ./pages/index.js"
      `)
    }

    await cleanup()
  })

  test('Module not found (empty import trace)', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'pages/index.js',
      outdent`
        import Comp from 'b'

        export default function Oops() {
          return (
            <div>
              <Comp>lol</Comp>
            </div>
          )
        }
      `
    )

    expect(await session.hasRedbox()).toBe(true)

    const source = await session.getRedboxSource()
    if (process.env.TURBOPACK) {
      expect(source).toMatchInlineSnapshot(`
        "./pages/index.js:1:1
        Module not found: Can't resolve 'b'
        > 1 | import Comp from 'b'
            | ^^^^^^^^^^^^^^^^^^^^
          2 |
          3 | export default function Oops() {
          4 |   return (

        https://nextjs.org/docs/messages/module-not-found"
      `)
    } else {
      expect(source).toMatchInlineSnapshot(`
        "./pages/index.js:1:1
        Module not found: Can't resolve 'b'
        > 1 | import Comp from 'b'
            | ^
          2 |
          3 | export default function Oops() {
          4 |   return (

        https://nextjs.org/docs/messages/module-not-found"
      `)
    }

    await cleanup()
  })

  test('Module not found (missing global CSS)', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        [
          'pages/_app.js',
          outdent`
            import './non-existent.css'

            export default function App({ Component, pageProps }) {
              return <Component {...pageProps} />
            }
          `,
        ],
        [
          'pages/index.js',
          outdent`
            export default function Page(props) {
              return <p>index page</p>
            }
          `,
        ],
      ])
    )
    expect(await session.hasRedbox()).toBe(true)

    const source = await session.getRedboxSource()
    if (process.env.TURBOPACK) {
      expect(source).toMatchInlineSnapshot(`
        "./pages/_app.js:1:1
        Module not found: Can't resolve './non-existent.css'
        > 1 | import './non-existent.css'
            | ^^^^^^^^^^^^^^^^^^^^^^^^^^^
          2 |
          3 | export default function App({ Component, pageProps }) {
          4 |   return <Component {...pageProps} />

        https://nextjs.org/docs/messages/module-not-found"
      `)
    } else {
      expect(source).toMatchInlineSnapshot(`
        "./pages/_app.js:1:1
        Module not found: Can't resolve './non-existent.css'
        > 1 | import './non-existent.css'
            | ^
          2 |
          3 | export default function App({ Component, pageProps }) {
          4 |   return <Component {...pageProps} />

        https://nextjs.org/docs/messages/module-not-found"
      `)
    }

    await session.patch(
      'pages/_app.js',
      outdent`
        export default function App({ Component, pageProps }) {
          return <Component {...pageProps} />
        }
      `
    )
    expect(await session.hasRedbox()).toBe(false)
    expect(
      await session.evaluate(() => document.documentElement.innerHTML)
    ).toContain('index page')

    await cleanup()
  })
})
