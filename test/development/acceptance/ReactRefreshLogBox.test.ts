/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  getRedboxTotalErrorCount,
  getStackFramesContent,
  retry,
  toggleCollapseCallStackFrames,
} from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

describe('ReactRefreshLogBox', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  test('should strip whitespace correctly with newline', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        export default function Page() {
          return (
            <>

                          <p>index page</p>

                          <a onClick={() => {
                            throw new Error('idk')
                          }}>
                            click me
                          </a>
            </>
          )
        }
      `
    )
    await session.evaluate(() => document.querySelector('a').click())

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: idk",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (8:27) @ onClick
       >  8 |                     throw new Error('idk')
            |                           ^",
         "stack": [
           "onClick index.js (8:27)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: idk",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (8:27) @ onClick
       >  8 |                     throw new Error('idk')
            |                           ^",
         "stack": [
           "onClick index.js (8:27)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    }
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137807
  test('module init error not shown', async () => {
    // Start here:
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    // We start here.
    await session.patch(
      'index.js',
      outdent`
        import * as React from 'react';
        class ClassDefault extends React.Component {
          render() {
            return <h1>Default Export</h1>;
          }
        }
        export default ClassDefault;
      `
    )

    expect(
      await session.evaluate(() => document.querySelector('h1').textContent)
    ).toBe('Default Export')

    // Add a throw in module init phase:
    await session.patch(
      'index.js',
      outdent`
        // top offset for snapshot
        import * as React from 'react';
        throw new Error('no')
        class ClassDefault extends React.Component {
          render() {
            return <h1>Default Export</h1>;
          }
        }
        export default ClassDefault;
      `
    )

    if (isReact18) {
      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Error: no",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (3:7) @ [project]/index.js [ssr] (ecmascript)
         > 3 | throw new Error('no')
             |       ^",
           "stack": [
             "[project]/index.js [ssr] (ecmascript) index.js (3:7)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Error: no",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (3:7) @ eval
         > 3 | throw new Error('no')
             |       ^",
           "stack": [
             "eval index.js (3:7)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "eval ./pages/index.js",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      }
    } else {
      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Error: no",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (3:7) @ [project]/index.js [ssr] (ecmascript)
         > 3 | throw new Error('no')
             |       ^",
           "stack": [
             "[project]/index.js [ssr] (ecmascript) index.js (3:7)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Error: no",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (3:7) @ eval
         > 3 | throw new Error('no')
             |       ^",
           "stack": [
             "eval index.js (3:7)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "eval ./pages/index.js",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      }
    }
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554152127
  test('boundaries', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.write(
      'FunctionDefault.js',
      outdent`
        export default function FunctionDefault() {
          return <h2>hello</h2>
        }
      `
    )
    await session.patch(
      'index.js',
      outdent`
        import FunctionDefault from './FunctionDefault.js'
        import * as React from 'react'
        class ErrorBoundary extends React.Component {
          constructor() {
            super()
            this.state = { hasError: false, error: null };
          }
          static getDerivedStateFromError(error) {
            return {
              hasError: true,
              error
            };
          }
          render() {
            if (this.state.hasError) {
              return this.props.fallback;
            }
            return this.props.children;
          }
        }
        function App() {
          return (
            <ErrorBoundary fallback={<h2>error</h2>}>
              <FunctionDefault />
            </ErrorBoundary>
          );
        }
        export default App;
      `
    )

    expect(
      await session.evaluate(() => document.querySelector('h2').textContent)
    ).toBe('hello')

    await session.write(
      'FunctionDefault.js',
      `export default function FunctionDefault() { throw new Error('no'); }`
    )

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 2,
         "description": "Error: no",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "FunctionDefault.js (1:51) @ FunctionDefault
       > 1 | export default function FunctionDefault() { throw new Error('no'); }
           |                                                   ^",
         "stack": [
           "FunctionDefault FunctionDefault.js (1:51)",
           "Set.forEach <anonymous> (0:0)",
           "${isTurbopack ? '<FIXME-file-protocol>' : '<FIXME-next-dist-dir>'}",
           "${isTurbopack ? '<FIXME-file-protocol>' : '<FIXME-next-dist-dir>'}",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: no",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "FunctionDefault.js (1:51) @ FunctionDefault
       > 1 | export default function FunctionDefault() { throw new Error('no'); }
           |                                                   ^",
         "stack": [
           "FunctionDefault FunctionDefault.js (1:51)",
           "Set.forEach <anonymous> (0:0)",
           "${isTurbopack ? '<FIXME-file-protocol>' : '<FIXME-next-dist-dir>'}",
           "${isTurbopack ? '<FIXME-file-protocol>' : '<FIXME-next-dist-dir>'}",
         ],
       }
      `)
    }
  })

  // TODO: investigate why this fails when running outside of the Next.js
  // monorepo e.g. fails when using pnpm create next-app
  // https://github.com/vercel/next.js/pull/23203
  test.skip('internal package errors', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    // Make a react build-time error.
    await session.patch(
      'index.js',
      outdent`
        export default function FunctionNamed() {
          return <div>{{}}</div>
        }`
    )

    if (isReact18) {
      await expect(browser).toDisplayRedbox()
    } else {
      await expect(browser).toDisplayRedbox()
    }
  })

  test('unterminated JSX', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        export default () => {
          return (
            <div>
              <p>lol</p>
            </div>
          )
        }
      `
    )

    await session.assertNoRedbox()

    await session.patch(
      'index.js',
      outdent`
        export default () => {
          return (
            <div>
              <p>lol</p>
            div
          )
        }
      `
    )

    if (process.env.TURBOPACK) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (7:1)
       Parsing ecmascript source code failed
       > 7 | }
           | ^",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error:   x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
       Error:   x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
          ,-[7:1]
        4 |       <p>lol</p>
        5 |     div
        6 |   )
        7 | }
          : ^
          \`----
         x Unexpected eof
          ,-[7:1]
        4 |       <p>lol</p>
        5 |     div
        6 |   )
        7 | }
          \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    }
  })

  test('conversion to class component (1)', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.write(
      'Child.js',
      outdent`
        export default function ClickCount() {
          return <p>hello</p>
        }
      `
    )

    await session.patch(
      'index.js',
      outdent`
        import Child from './Child';

        export default function Home() {
          return (
            <div>
              <Child />
            </div>
          )
        }
      `
    )

    await session.assertNoRedbox()
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('hello')

    await session.patch(
      'Child.js',
      outdent`
        import { Component } from 'react';
        export default class ClickCount extends Component {
          render() {
            throw new Error()
          }
        }
      `
    )

    // TODO(veil): ignore-list Webpack runtime (https://linear.app/vercel/issue/NDX-945)
    // TODO(veil): Don't bail in Turbopack for sources outside of the project (https://linear.app/vercel/issue/NDX-944)
    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 2,
         "description": "Error: ",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "Child.js (4:11) @ ClickCount.render
       > 4 |     throw new Error()
           |           ^",
         "stack": [
           "ClickCount.render Child.js (4:11)",
           "Set.forEach <anonymous> (0:0)",
           "${isTurbopack ? '<FIXME-file-protocol>' : '<FIXME-next-dist-dir>'}",
           "${isTurbopack ? '<FIXME-file-protocol>' : '<FIXME-next-dist-dir>'}",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: ",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "Child.js (4:11) @ ClickCount.render
       > 4 |     throw new Error()
           |           ^",
         "stack": [
           "ClickCount.render Child.js (4:11)",
           "Set.forEach <anonymous> (0:0)",
           "${isTurbopack ? '<FIXME-file-protocol>' : '<FIXME-next-dist-dir>'}",
           "${isTurbopack ? '<FIXME-file-protocol>' : '<FIXME-next-dist-dir>'}",
         ],
       }
      `)
    }

    await session.patch(
      'Child.js',
      outdent`
      import { Component } from 'react';
        export default class ClickCount extends Component {
          render() {
            return <p>hello new</p>
          }
        }
      `
    )

    await session.assertNoRedbox()
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('hello new')
  })

  test('css syntax errors', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.write('index.module.css', `.button {}`)
    await session.patch(
      'index.js',
      outdent`
        import './index.module.css';
        export default () => {
          return (
            <div>
              <p>lol</p>
            </div>
          )
        }
      `
    )

    await session.assertNoRedbox()

    // Syntax error
    await session.patch('index.module.css', `.button`)

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Parsing css source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.module.css (1:9)
       Parsing css source code failed
       > 1 | .button
           |         ^",
         "stack": [],
       }
      `)
    } else {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Syntax error: <FIXME-project-root>/index.module.css Unknown word",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.module.css (1:1)
       Syntax error: <FIXME-project-root>/index.module.css Unknown word
       > 1 | .button
           | ^",
         "stack": [],
       }
      `)
    }

    // Checks for selectors that can't be prefixed.
    // Selector "button" is not pure (pure selectors must contain at least one local class or id)
    await session.patch('index.module.css', `button {}`)

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Parsing css source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.module.css
       Parsing css source code failed
       Selector is not pure (pure selectors must contain at least one local class or id), (lightningcss, Selector(button, specificity = 0x1))",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Syntax error: Selector "button" is not pure (pure selectors must contain at least one local class or id)",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.module.css (1:1)
       Syntax error: Selector "button" is not pure (pure selectors must contain at least one local class or id)
       > 1 | button {}
           | ^",
         "stack": [],
       }
      `)
    }
  })

  test('logbox: anchors links in error messages', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        import { useCallback } from 'react'

        export default function Index() {
          const boom = useCallback(() => {
            throw new Error('end https://nextjs.org')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    await session.assertNoRedbox()
    await session.evaluate(() => document.querySelector('button').click())

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: end https://nextjs.org",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('end https://nextjs.org')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: end https://nextjs.org",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('end https://nextjs.org')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    }

    await session.patch(
      'index.js',
      outdent`
        import { useCallback } from 'react'

        export default function Index() {
          const boom = useCallback(() => {
            throw new Error('https://nextjs.org start')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    await session.assertNoRedbox()
    await session.evaluate(() => document.querySelector('button').click())

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: https://nextjs.org start",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('https://nextjs.org start')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: https://nextjs.org start",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('https://nextjs.org start')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    }

    await session.patch(
      'index.js',
      outdent`
        import { useCallback } from 'react'

        export default function Index() {
          const boom = useCallback(() => {
            throw new Error('middle https://nextjs.org end')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    await session.assertNoRedbox()
    await session.evaluate(() => document.querySelector('button').click())

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: middle https://nextjs.org end",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('middle https://nextjs.org end')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: middle https://nextjs.org end",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('middle https://nextjs.org end')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    }

    await session.patch(
      'index.js',
      outdent`
        import { useCallback } from 'react'

        export default function Index() {
          const boom = useCallback(() => {
            throw new Error('multiple https://nextjs.org links http://example.com')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    await session.assertNoRedbox()
    await session.evaluate(() => document.querySelector('button').click())

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: multiple https://nextjs.org links http://example.com",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('multiple https://nextjs.org links http://example.com')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: multiple https://nextjs.org links http://example.com",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('multiple https://nextjs.org links http://example.com')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    }

    await session.patch(
      'index.js',
      outdent`
        import { useCallback } from 'react'

        export default function Index() {
          const boom = useCallback(() => {
            throw new Error('multiple https://nextjs.org links (http://example.com)')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    await session.assertNoRedbox()
    await session.evaluate(() => document.querySelector('button').click())

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: multiple https://nextjs.org links (http://example.com)",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('multiple https://nextjs.org links (http://example.com)')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: multiple https://nextjs.org links (http://example.com)",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('multiple https://nextjs.org links (http://example.com)')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "UtilityScript.evaluate <anonymous> (236:17)",
           "UtilityScript.<anonymous> <anonymous> (1:44)",
         ],
       }
      `)
    }
  })

  test('non-Error errors are handled properly', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        export default () => {
          throw {'a': 1, 'b': 'x'};
          return (
            <div>hello</div>
          )
        }
      `
    )

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: {"a":1,"b":"x"}",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: {"a":1,"b":"x"}",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }

    // fix previous error
    await session.patch(
      'index.js',
      outdent`
        export default () => {
          return (
            <div>hello</div>
          )
        }
      `
    )
    await session.assertNoRedbox()
    await session.patch(
      'index.js',
      outdent`
        class Hello {}

        export default () => {
          throw Hello
          return (
            <div>hello</div>
          )
        }
      `
    )

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: class Hello {
       }",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: class Hello {
       }",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }

    // fix previous error
    await session.patch(
      'index.js',
      outdent`
        export default () => {
          return (
            <div>hello</div>
          )
        }
      `
    )
    await session.assertNoRedbox()
    await session.patch(
      'index.js',
      outdent`
        export default () => {
          throw "string error"
          return (
            <div>hello</div>
          )
        }
      `
    )

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: string error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: string error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }

    // fix previous error
    await session.patch(
      'index.js',
      outdent`
        export default () => {
          return (
            <div>hello</div>
          )
        }
      `
    )
    await session.assertNoRedbox()
    await session.patch(
      'index.js',
      outdent`
        export default () => {
          throw null
          return (
            <div>hello</div>
          )
        }
      `
    )

    if (isReact18) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: A null error was thrown, see here for more info: https://nextjs.org/docs/messages/threw-undefined",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: A null error was thrown, see here for more info: https://nextjs.org/docs/messages/threw-undefined",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }
  })

  it('Call stack count is correct for pages error', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'pages/index.js',
          outdent`
            export default function Page() {
              if (typeof window !== 'undefined') {
                throw new Error('Client error')
              }
              return null
            }
          `,
        ],
      ])
    )
    const { browser } = sandbox

    if (isReact18) {
      if (isTurbopack) {
        // Wait for the error to reach the correct count
        await retry(async () => {
          expect(await getRedboxTotalErrorCount(browser)).toBe(3)
        })
        await expect(browser).toDisplayRedbox(`
         {
           "count": 3,
           "description": "Error: Client error",
           "environmentLabel": null,
           "label": "Unhandled Runtime Error",
           "source": "pages/index.js (3:11) @ Page
         > 3 |     throw new Error('Client error')
             |           ^",
           "stack": [
             "Page pages/index.js (3:11)",
           ],
         }
        `)
      } else {
        // Wait for the error to reach the correct count
        await retry(async () => {
          expect(await getRedboxTotalErrorCount(browser)).toBe(3)
        })
        await expect(browser).toDisplayRedbox(`
         {
           "count": 3,
           "description": "Error: Client error",
           "environmentLabel": null,
           "label": "Unhandled Runtime Error",
           "source": "pages/index.js (3:11) @ Page
         > 3 |     throw new Error('Client error')
             |           ^",
           "stack": [
             "Page pages/index.js (3:11)",
           ],
         }
        `)
      }
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: Client error",
         "environmentLabel": null,
         "label": "Unhandled Runtime Error",
         "source": "pages/index.js (3:11) @ Page
       > 3 |     throw new Error('Client error')
           |           ^",
         "stack": [
           "Page pages/index.js (3:11)",
         ],
       }
      `)
    }

    await toggleCollapseCallStackFrames(browser)

    // Expect more than the default amount of frames
    // The default stackTraceLimit results in max 9 [data-nextjs-call-stack-frame] elements

    const callStackFrames = await browser.elementsByCss(
      '[data-nextjs-call-stack-frame]'
    )

    expect(callStackFrames.length).toBeGreaterThan(9)
  })

  // TODO: hide the anonymous frames between 2 ignored frames
  test('should show anonymous frames from stack trace', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'pages/index.js',
          outdent`
          export default function Page() {
            [1, 2, 3].map(() => {
              throw new Error("anonymous error!");
            })
          }`,
        ],
      ])
    )
    const { browser } = sandbox
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: anonymous error!",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "pages/index.js (3:11) @ <unknown>
       > 3 |     throw new Error("anonymous error!");
           |           ^",
         "stack": [
           "<unknown> pages/index.js (3:11)",
           "Array.map <anonymous> (0:0)",
           "Page pages/index.js (2:13)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Error: anonymous error!",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "pages/index.js (3:11) @ eval
       > 3 |     throw new Error("anonymous error!");
           |           ^",
         "stack": [
           "eval pages/index.js (3:11)",
           "Array.map <anonymous> (0:0)",
           "Page pages/index.js (2:13)",
         ],
       }
      `)
    }
  })

  test('should collapse nodejs internal stack frames from stack trace', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'pages/index.js',
          outdent`
          export default function Page() {}
          
          function createURL() {
            new URL("/", "invalid")
          }

          export function getServerSideProps() {
            createURL()
            return { props: {} }
          }`,
        ],
      ])
    )

    const { browser } = sandbox

    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "TypeError: Invalid URL",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "pages/index.js (4:3) @ createURL
     > 4 |   new URL("/", "invalid")
         |   ^",
       "stack": [
         "createURL pages/index.js (4:3)",
         "getServerSideProps pages/index.js (8:3)",
       ],
     }
    `)

    await toggleCollapseCallStackFrames(browser)
    const stackCollapsed = await getStackFramesContent(browser)
    expect(stackCollapsed).toContain('at new URL ()')
  })
})
