import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { describeVariants as describe } from 'next-test-utils'
import { outdent } from 'outdent'

// TODO-APP: Investigate snapshot mismatch
describe.each(['default', 'turbo'])('ReactRefreshLogBox app %s', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  // Module trace is only available with webpack 5
  test('Node.js builtins', async () => {
    await using sandbox = await createSandbox(
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

    const { session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        import pkg from 'my-package'

        export default function Hello() {
          return (pkg ? <h1>Package loaded</h1> : <h1>Package did not load</h1>)
        }
      `
    )
    await session.assertHasRedbox()
    if (process.env.TURBOPACK) {
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
       "./node_modules/my-package/index.js (1:13)
       Module not found: Can't resolve 'dns'
       > 1 | const dns = require('dns')
           |             ^^^^^^^^^^^^^^
         2 | module.exports = dns

       https://nextjs.org/docs/messages/module-not-found"
      `)
    } else {
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
       "./node_modules/my-package/index.js (1:1)
       Module not found: Can't resolve 'dns'
       > 1 | const dns = require('dns')
           | ^
         2 | module.exports = dns

       https://nextjs.org/docs/messages/module-not-found

       Import trace for requested module:
       ./index.js
       ./app/page.js"
      `)
    }
  })

  test('Module not found', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertHasRedbox()

    const source = await session.getRedboxSource()
    if (process.env.TURBOPACK) {
      expect(source).toMatchInlineSnapshot(`
       "./index.js (1:1)
       Module not found: Can't resolve 'b'
       > 1 | import Comp from 'b'
           | ^^^^^^^^^^^^^^^^^^^^
         2 | export default function Oops() {
         3 |   return (
         4 |     <div>

       https://nextjs.org/docs/messages/module-not-found"
      `)
    } else {
      expect(source).toMatchInlineSnapshot(`
       "./index.js (1:1)
       Module not found: Can't resolve 'b'
       > 1 | import Comp from 'b'
           | ^
         2 | export default function Oops() {
         3 |   return (
         4 |     <div>

       https://nextjs.org/docs/messages/module-not-found

       Import trace for requested module:
       ./app/page.js"
      `)
    }
  })

  test('Module not found empty import trace', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

    await session.patch(
      'app/page.js',
      outdent`
        'use client'
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

    await session.assertHasRedbox()

    const source = await session.getRedboxSource()
    if (process.env.TURBOPACK) {
      expect(source).toMatchInlineSnapshot(`
       "./app/page.js (2:1)
       Module not found: Can't resolve 'b'
         1 | 'use client'
       > 2 | import Comp from 'b'
           | ^^^^^^^^^^^^^^^^^^^^
         3 | export default function Oops() {
         4 |   return (
         5 |     <div>

       https://nextjs.org/docs/messages/module-not-found"
      `)
    } else {
      expect(source).toMatchInlineSnapshot(`
       "./app/page.js (2:1)
       Module not found: Can't resolve 'b'
         1 | 'use client'
       > 2 | import Comp from 'b'
           | ^
         3 | export default function Oops() {
         4 |   return (
         5 |     <div>

       https://nextjs.org/docs/messages/module-not-found"
      `)
    }
  })

  test('Module not found missing global CSS', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
            import './non-existent.css'
            export default function Page(props) {
              return <p>index page</p>
            }
          `,
        ],
      ])
    )
    const { session } = sandbox
    await session.assertHasRedbox()

    const source = await session.getRedboxSource()
    if (process.env.TURBOPACK) {
      expect(source).toMatchInlineSnapshot(`
       "./app/page.js (2:1)
       Module not found: Can't resolve './non-existent.css'
         1 | 'use client'
       > 2 | import './non-existent.css'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^
         3 | export default function Page(props) {
         4 |   return <p>index page</p>
         5 | }

       https://nextjs.org/docs/messages/module-not-found"
      `)
    } else {
      expect(source).toMatchInlineSnapshot(`
       "./app/page.js (2:1)
       Module not found: Can't resolve './non-existent.css'
         1 | 'use client'
       > 2 | import './non-existent.css'
           | ^
         3 | export default function Page(props) {
         4 |   return <p>index page</p>
         5 | }

       https://nextjs.org/docs/messages/module-not-found"
      `)
    }
    await session.patch(
      'app/page.js',
      outdent`
        'use client'
        export default function Page(props) {
          return <p>index page</p>
        }
      `
    )
    await session.assertNoRedbox()
    expect(
      await session.evaluate(() => document.documentElement.innerHTML)
    ).toContain('index page')
  })
})
