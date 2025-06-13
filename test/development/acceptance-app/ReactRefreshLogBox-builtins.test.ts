import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'
import {
  getRedboxDescription,
  getRedboxLabel,
  getRedboxSource,
} from 'next-test-utils'

describe('ReactRefreshLogBox-builtins app', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })
  const isRspack = Boolean(process.env.NEXT_RSPACK)

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
         "description": "Module not found: Can't resolve 'dns'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./node_modules/my-package/index.js (1:13)
       Module not found: Can't resolve 'dns'
       > 1 | const dns = require('dns')
           |             ^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await session.assertHasRedbox()
      const redboxContent = await getRedboxDescription(browser)
      const redboxLabel = await getRedboxLabel(browser)
      const redboxSource = await getRedboxSource(browser)
      expect(redboxContent).toContain("Module not found: Can't resolve 'dns'")
      expect(redboxLabel).toContain('Build Error')
      expect(redboxSource).toContain('./node_modules/my-package/index.js')
      expect(redboxSource).toContain("const dns = require('dns')")
      expect(redboxSource).toContain('module.exports = dns')
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve 'dns'",
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
         "description": "Module not found: Can't resolve 'b'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (1:1)
       Module not found: Can't resolve 'b'
       > 1 | import Comp from 'b'
           | ^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await session.assertHasRedbox()
      const redboxContent = await getRedboxDescription(browser)
      const redboxLabel = await getRedboxLabel(browser)
      const redboxSource = await getRedboxSource(browser)
      expect(redboxContent).toContain("Module not found: Can't resolve 'b'")
      expect(redboxLabel).toContain('Build Error')
      expect(redboxSource).toContain('./index.js')
      expect(redboxSource).toContain("import Comp from 'b'")
      expect(redboxSource).toContain('export default function Oops()')
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve 'b'",
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
         "description": "Module not found: Can't resolve 'b'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js (2:1)
       Module not found: Can't resolve 'b'
       > 2 | import Comp from 'b'
           | ^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await session.assertHasRedbox()
      const redboxContent = await getRedboxDescription(browser)
      const redboxLabel = await getRedboxLabel(browser)
      const redboxSource = await getRedboxSource(browser)
      expect(redboxContent).toContain("Module not found: Can't resolve 'b'")
      expect(redboxLabel).toContain('Build Error')
      expect(redboxSource).toContain('./app/page.js')
      expect(redboxSource).toContain("import Comp from 'b'")
      expect(redboxSource).toContain('export default function Oops()')
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve 'b'",
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
         "description": "Module not found: Can't resolve './non-existent.css'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js (2:1)
       Module not found: Can't resolve './non-existent.css'
       > 2 | import './non-existent.css'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await session.assertHasRedbox()
      const redboxContent = await getRedboxDescription(browser)
      const redboxLabel = await getRedboxLabel(browser)
      const redboxSource = await getRedboxSource(browser)
      expect(redboxContent).toContain(
        "Module not found: Can't resolve './non-existent.css'"
      )
      expect(redboxLabel).toContain('Build Error')
      expect(redboxSource).toContain('./app/page.js')
      expect(redboxSource).toContain("import './non-existent.css'")
      expect(redboxSource).toContain('export default function Page(props)')
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve './non-existent.css'",
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
