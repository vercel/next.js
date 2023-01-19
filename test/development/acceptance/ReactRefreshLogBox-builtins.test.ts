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

    // Module trace is only available with webpack 5
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

    test('Module not found', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.patch(
        'index.js',
        `import Comp from 'b'
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
        `import Comp from 'b'
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
            `
        import './non-existent.css'

        export default function App({ Component, pageProps }) {
          return <Component {...pageProps} />
        }
      `,
          ],
          [
            'pages/index.js',
            `
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
        `
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
}
