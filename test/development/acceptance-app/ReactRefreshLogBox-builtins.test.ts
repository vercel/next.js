import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'

describe('ReactRefreshLogBox-builtins app', () => {
  const { isTurbopack, next } = nextTestSetup({
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

    const { browser, session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        import pkg from 'my-package'

        export default function Hello() {
          return (pkg ? <h1>Package loaded</h1> : <h1>Package did not load</h1>)
        }
      `
    )
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Module not found: Can't resolve 'dns'",
         "docs": null,
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./node_modules/my-package/index.js (1:13)
       Module not found: Can't resolve 'dns'
       > 1 | const dns = require('dns')
           |             ^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Module not found: Can't resolve 'dns'",
         "docs": null,
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./node_modules/my-package/index.js (1:1)
       Module not found: Can't resolve 'dns'
       > 1 | const dns = require('dns')
           | ^",
         "stack": [],
       }
      `)
    }
  })

  test('Module not found', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Module not found: Can't resolve 'b'",
         "docs": null,
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (1:1)
       Module not found: Can't resolve 'b'
       > 1 | import Comp from 'b'
           | ^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Module not found: Can't resolve 'b'",
         "docs": null,
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (1:1)
       Module not found: Can't resolve 'b'
       > 1 | import Comp from 'b'
           | ^",
         "stack": [],
       }
      `)
    }
  })

  test('Module not found empty import trace', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Module not found: Can't resolve 'b'",
         "docs": null,
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js (2:1)
       Module not found: Can't resolve 'b'
       > 2 | import Comp from 'b'
           | ^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Module not found: Can't resolve 'b'",
         "docs": null,
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js (2:1)
       Module not found: Can't resolve 'b'
       > 2 | import Comp from 'b'
           | ^",
         "stack": [],
       }
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
    const { browser, session } = sandbox
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Module not found: Can't resolve './non-existent.css'",
         "docs": null,
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js (2:1)
       Module not found: Can't resolve './non-existent.css'
       > 2 | import './non-existent.css'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Module not found: Can't resolve './non-existent.css'",
         "docs": null,
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js (2:1)
       Module not found: Can't resolve './non-existent.css'
       > 2 | import './non-existent.css'
           | ^",
         "stack": [],
       }
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
