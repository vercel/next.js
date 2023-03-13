import { sandbox } from './helpers'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import path from 'path'
import { getSnapshotTestDescribe } from 'next-test-utils'

// TODO-APP: Investigate snapshot mismatch
for (const variant of ['default', 'turbo']) {
  getSnapshotTestDescribe(variant)(`ReactRefreshLogBox app ${variant}`, () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: new FileRef(
          path.join(__dirname, 'fixtures', 'default-template')
        ),
        dependencies: {
          react: 'latest',
          'react-dom': 'latest',
        },
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

    test('Module not found empty import trace', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.patch(
        'app/page.js',
        `'use client'
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

    test('Module not found missing global CSS', async () => {
      const { session, cleanup } = await sandbox(
        next,
        new Map([
          [
            'app/page.js',
            `'use client'
          import './non-existent.css'
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
        'app/page.js',
        `'use client'
      export default function Page(props) {
        return <p>index page</p>
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
