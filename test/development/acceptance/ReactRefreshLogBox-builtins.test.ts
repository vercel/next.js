import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'
import path from 'path'

describe('ReactRefreshLogBox', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })
  const isRspack = !!process.env.NEXT_RSPACK

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
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module not found: Can't resolve 'dns' in '<FIXME-project-root>/node_modules/my-package'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./node_modules/my-package/index.js
         × Module not found: Can't resolve 'dns' in '<FIXME-project-root>/node_modules/my-package'
          ╭─[1:12]
        1 │ const dns = require('dns')
          ·             ──────────────
        2 │ module.exports = dns
          ╰────
       Import trace for requested module:
       ./node_modules/my-package/index.js
       ./index.js",
         "stack": [],
       }
      `)
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
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module not found: Can't resolve 'b' in '<FIXME-project-root>'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
         × Module not found: Can't resolve 'b' in '<FIXME-project-root>'
          ╭─[2:17]
        1 │ import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
        2 │ import Comp from 'b';
          ·                  ───
        3 │ export default function Oops() {
        4 │     return /*#__PURE__*/ _jsxDEV("div", {
          ╰────
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
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

  test('Module not found (empty import trace)', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve 'b'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/index.js (1:1)
       Module not found: Can't resolve 'b'
       > 1 | import Comp from 'b'
           | ^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module not found: Can't resolve 'b' in '<FIXME-project-root>/pages'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/index.js
         × Module not found: Can't resolve 'b' in '<FIXME-project-root>/pages'
          ╭─[2:17]
        1 │ import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
        2 │ import Comp from 'b';
          ·                  ───
        3 │ export default function Oops() {
        4 │     return /*#__PURE__*/ _jsxDEV("div", {
          ╰────
       Import trace for requested module:
       ./pages/index.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve 'b'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/index.js (1:1)
       Module not found: Can't resolve 'b'
       > 1 | import Comp from 'b'
           | ^",
         "stack": [],
       }
      `)
    }
  })

  test('Module not found (missing global CSS)', async () => {
    await using sandbox = await createSandbox(
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
    const { browser, session } = sandbox

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve './non-existent.css'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_app.js (1:1)
       Module not found: Can't resolve './non-existent.css'
       > 1 | import './non-existent.css'
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module not found: Can't resolve './non-existent.css' in '<FIXME-project-root>/pages'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_app.js
         × Module not found: Can't resolve './non-existent.css' in '<FIXME-project-root>/pages'
          ╭─[2:7]
        1 │ import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
        2 │ import './non-existent.css';
          ·        ────────────────────
        3 │ export default function App({ Component, pageProps }) {
        4 │     return /*#__PURE__*/ _jsxDEV(Component, {
          ╰────",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve './non-existent.css'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./pages/_app.js (1:1)
       Module not found: Can't resolve './non-existent.css'
       > 1 | import './non-existent.css'
           | ^",
         "stack": [],
       }
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
    await session.assertNoRedbox()
    expect(
      await session.evaluate(() => document.documentElement.innerHTML)
    ).toContain('index page')
  })
})
