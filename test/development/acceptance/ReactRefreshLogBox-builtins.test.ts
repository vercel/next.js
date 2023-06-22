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
    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxSource()).toMatchSnapshot()

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

    expect(await session.hasRedbox(true)).toBe(true)

    const source = await session.getRedboxSource()
    expect(source).toMatchSnapshot()

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

    expect(await session.hasRedbox(true)).toBe(true)

    const source = await session.getRedboxSource()
    expect(source).toMatchSnapshot()

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
    expect(await session.hasRedbox(true)).toBe(true)

    const source = await session.getRedboxSource()
    expect(source).toMatchSnapshot()

    await session.patch(
      'pages/_app.js',
      outdent`
        export default function App({ Component, pageProps }) {
          return <Component {...pageProps} />
        }
      `
    )
    expect(await session.hasRedbox(false)).toBe(false)
    expect(
      await session.evaluate(() => document.documentElement.innerHTML)
    ).toContain('index page')

    await cleanup()
  })
})
