/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { getToastErrorCount, retry } from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

describe('ReactRefreshLogBox app', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
    patchFileDelay: 1000,
  })

  const isRspack = !!process.env.NEXT_RSPACK

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
    await browser.elementByCss('a').click()

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(
        `"Expected Redbox but found no visible one."`
      )
    } else {
      await expect(browser).toDisplayRedbox(
        `"Expected Redbox but found no visible one."`
      )
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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "no",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (3:7) @ module evaluation
       > 3 | throw new Error('no')
           |       ^",
         "stack": [
           "module evaluation index.js (3:7)",
           "module evaluation app/page.js (2:1)",
         ],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "no",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (3:7) @ eval
       > 3 | throw new Error('no')
           |       ^",
         "stack": [
           "eval index.js (3:7)",
           "<FIXME-next-dist-dir>",
           "<FIXME-next-dist-dir>",
           "<FIXME-next-dist-dir>",
           "eval ./app/page.js",
           "<FIXME-next-dist-dir>",
           "<FIXME-next-dist-dir>",
           "<FIXME-next-dist-dir>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       [
         {
           "description": "no",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (3:7) @ eval
       > 3 | throw new Error('no')
           |       ^",
           "stack": [
             "eval index.js (3:7)",
             "<FIXME-next-dist-dir>",
             "eval ./app/page.js",
             "<FIXME-next-dist-dir>",
           ],
         },
         {
           "description": "no",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (3:7) @ eval
       > 3 | throw new Error('no')
           |       ^",
           "stack": [
             "eval index.js (3:7)",
             "<FIXME-next-dist-dir>",
             "eval ./app/page.js",
             "<FIXME-next-dist-dir>",
           ],
         },
       ]
      `)
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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(
        `"Expected Redbox but found no visible one."`
      )
    } else {
      await expect(browser).toDisplayRedbox(
        `"Expected Redbox but found no visible one."`
      )
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
        }
      `
    )

    await expect(browser).toDisplayRedbox()
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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
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
    } else if (isRspack) {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
         × Module build failed:
         ╰─▶   × Error:   x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
               │    ,-[7:1]
               │  4 |       <p>lol</p>
               │  5 |     div
               │  6 |   )
               │  7 | }
               │    : ^
               │    \`----
               │   x Expected '</', got '<eof>'
               │    ,-[7:1]
               │  4 |       <p>lol</p>
               │  5 |     div
               │  6 |   )
               │  7 | }
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./index.js
       ./app/page.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?",
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
         x Expected '</', got '<eof>'
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
       ./app/page.js",
         "stack": [],
       }
      `)
    }
  })

  // Module trace is only available with webpack 5
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

    if (isTurbopack) {
      // TODO(veil): Possibly https://linear.app/vercel/issue/NEXT-4411
      await expect(browser).toDisplayRedbox(`
       {
         "description": "",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "Child.js (4:11) @ ClickCount.render
       > 4 |     throw new Error()
           |           ^",
         "stack": [
           "ClickCount.render Child.js (4:11)",
           "Home index.js (6:7)",
           "<FIXME-file-protocol>",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "Child.js (4:11) @ ClickCount.render
       > 4 |     throw new Error()
           |           ^",
         "stack": [
           "ClickCount.render Child.js (4:11)",
           "Home index.js (6:7)",
           "Page app/page.js (4:10)",
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

    await session.patch('index.module.css', `.button`)

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing CSS source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.module.css (1:8)
       Parsing CSS source code failed
       > 1 | .button
           |        ^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.module.css
         × Module build failed:
         ╰─▶   × SyntaxError
               │
               │ (1:1) <FIXME-project-root>/index.module.css Unknown word
               │
               │ > 1 | .button
               │     | ^
               │
       Import trace for requested module:
       ./index.module.css
       ./index.js
       ./app/page.js",
         "stack": [],
       }
      `)
    } else {
      await expect({ browser, next }).toDisplayRedbox(`
       {
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
         "description": "Transforming CSS failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.module.css
       Transforming CSS failed
       Selector "button" is not pure. Pure selectors must contain at least one local class or id.
       Import traces:
         Client Component Browser:
           ./index.module.css [Client Component Browser]
           ./index.js [Client Component Browser]
           ./app/page.js [Client Component Browser]
           ./app/page.js [Server Component]
         Client Component SSR:
           ./index.module.css [Client Component SSR]
           ./index.js [Client Component SSR]
           ./app/page.js [Client Component SSR]
           ./app/page.js [Server Component]",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.module.css
         × Module build failed:
         ╰─▶   × CssSyntaxError
               │
               │ (1:1) Selector "button" is not pure (pure selectors must contain at least one local class or id)
               │
               │ > 1 | button {}
               │     | ^
               │
       Import trace for requested module:
       ./index.module.css
       ./index.js
       ./app/page.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
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

  it('logbox: anchors links in error messages', async () => {
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

    await browser.elementByCss('button').click()

    // TODO(veil): Why Owner Stack location different?
    if (isTurbopack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "end https://nextjs.org",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('end https://nextjs.org')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "button <anonymous>",
           "Index index.js (9:7)",
           "Page index.js (9:30)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "end https://nextjs.org",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('end https://nextjs.org')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "button <anonymous>",
           "Index index.js (9:7)",
           "Page app/page.js (4:10)",
         ],
       }
      `)
    }

    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchInlineSnapshot(`"https://nextjs.org/"`)

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

    await browser.elementByCss('button').click()

    // TODO(veil): Why Owner Stack location different?
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "https://nextjs.org start",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('https://nextjs.org start')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "button <anonymous>",
           "Index index.js (9:7)",
           "Page index.js (9:30)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "https://nextjs.org start",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('https://nextjs.org start')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "button <anonymous>",
           "Index index.js (9:7)",
           "Page app/page.js (4:10)",
         ],
       }
      `)
    }
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchInlineSnapshot(`"https://nextjs.org/"`)

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

    await browser.elementByCss('button').click()

    // TODO(veil): Why Owner Stack location different?
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "middle https://nextjs.org end",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('middle https://nextjs.org end')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "button <anonymous>",
           "Index index.js (9:7)",
           "Page index.js (9:30)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "middle https://nextjs.org end",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('middle https://nextjs.org end')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "button <anonymous>",
           "Index index.js (9:7)",
           "Page app/page.js (4:10)",
         ],
       }
      `)
    }
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchInlineSnapshot(`"https://nextjs.org/"`)

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

    await browser.elementByCss('button').click()

    // TODO(veil): Why Owner Stack location different?
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "multiple https://nextjs.org links http://example.com",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('multiple https://nextjs.org links http://example.com')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "button <anonymous>",
           "Index index.js (9:7)",
           "Page index.js (9:30)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "multiple https://nextjs.org links http://example.com",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:11) @ Index.useCallback[boom]
       > 5 |     throw new Error('multiple https://nextjs.org links http://example.com')
           |           ^",
         "stack": [
           "Index.useCallback[boom] index.js (5:11)",
           "button <anonymous>",
           "Index index.js (9:7)",
           "Page app/page.js (4:10)",
         ],
       }
      `)
    }
    // Do not highlight example.com but do highlight nextjs.org
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchInlineSnapshot(`"https://nextjs.org/"`)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(2)'
              ) as any
          ).href
      )
    ).toBe(null)
  })

  // TODO-APP: Catch errors that happen before useEffect
  test.skip('non-Error errors are handled properly', async () => {
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

    await expect(browser).toDisplayRedbox()

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

    await expect(browser).toDisplayRedbox()

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

    await expect(browser).toDisplayRedbox()

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

    await expect(browser).toDisplayRedbox()
  })

  test('Should not show __webpack_exports__ when exporting anonymous arrow function', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        export default () => {
          if (typeof window !== 'undefined') {
            throw new Error('test')
          }

          return null
        }
      `
    )

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "test",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (3:11) @ {default export}
       > 3 |     throw new Error('test')
           |           ^",
         "stack": [
           "{default export} index.js (3:11)",
           "Page app/page.js (2:1)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "test",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (3:11) @ default
       > 3 |     throw new Error('test')
           |           ^",
         "stack": [
           "default index.js (3:11)",
           "Page app/page.js (4:10)",
         ],
       }
      `)
    }
  })

  test('Unhandled errors and rejections opens up in the minimized state', async () => {
    await using sandbox = await createSandbox(next)
    const { session, browser } = sandbox

    const file = outdent`
      export default function Index() {
        //
        setTimeout(() => {
          throw new Error('Unhandled error')
        }, 0)
        setTimeout(() => {
          Promise.reject(new Error('Undhandled rejection'))
        }, 0)
        return (
          <>
            <button
              id="unhandled-error"
              onClick={() => {
                throw new Error('Unhandled error')
              }}
            >
              Unhandled error
            </button>
            <button
              id="unhandled-rejection"
              onClick={() => {
                Promise.reject(new Error('Undhandled rejection'))
              }}
            >
              Unhandled rejection
            </button>
          </>
        )
      }
    `

    await session.patch('index.js', file)

    // Unhandled error and rejection in setTimeout
    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(2)
    })

    // Unhandled error in event handler
    await browser.elementById('unhandled-error').click()
    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(3)
    })

    // Unhandled rejection in event handler
    await browser.elementById('unhandled-rejection').click()
    await retry(async () => {
      expect(await getToastErrorCount(browser)).toBe(4)
    })
    await session.assertNoRedbox()

    // Add Component error
    await session.patch(
      'index.js',
      file.replace(
        '//',
        "if (typeof window !== 'undefined') throw new Error('Component error')"
      )
    )

    // Render error should "win" and show up in fullscreen
    // TODO(veil): Why Owner Stack location different?
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Component error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (2:44) @ Index
       > 2 |   if (typeof window !== 'undefined') throw new Error('Component error')
           |                                            ^",
         "stack": [
           "Index index.js (2:44)",
           "Page index.js (16:8)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Component error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (2:44) @ Index
       > 2 |   if (typeof window !== 'undefined') throw new Error('Component error')
           |                                            ^",
         "stack": [
           "Index index.js (2:44)",
           "Page app/page.js (4:10)",
         ],
       }
      `)
    }
  })

  test('Call stack for client error', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
            'use client'
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

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Client error",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/page.js (4:11) @ Page
     > 4 |     throw new Error('Client error')
         |           ^",
       "stack": [
         "Page app/page.js (4:11)",
       ],
     }
    `)
  })

  test('Call stack for server error', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
      export default function Page() {
        throw new Error('Server error')
      }
    `,
        ],
      ])
    )
    const { browser } = sandbox

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Server error",
       "environmentLabel": "Server",
       "label": "Runtime Error",
       "source": "app/page.js (2:9) @ Page
     > 2 |   throw new Error('Server error')
         |         ^",
       "stack": [
         "Page app/page.js (2:9)",
       ],
     }
    `)
  })

  test('should hide unrelated frames in stack trace with unknown anonymous calls', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          outdent`
          export default function Page() {
            try {
              (function() {
                throw new Error("This is an error from an anonymous function");
              })();
            } catch (e) {
              throw e
            }
          }
        `,
        ],
      ])
    )
    const { browser } = sandbox

    // TODO(veil): Turbopack uses correct name
    // TODO(veil): Column of 2nd frame should be 7
    await expect(browser).toDisplayRedbox(`
      {
        "description": "This is an error from an anonymous function",
        "environmentLabel": "Server",
        "label": "Runtime Error",
        "source": "app/page.js (4:13) @ ${isTurbopack ? '<anonymous>' : 'eval'}
      > 4 |       throw new Error("This is an error from an anonymous function");
          |             ^",
        "stack": [
          "${isTurbopack ? '<anonymous>' : 'eval'} app/page.js (4:13)",
          "Page app/page.js (5:${isTurbopack ? '6' : '5'})",
        ],
      }
    `)
  })

  it('should hide unrelated frames in stack trace with nodejs internal calls', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.js',
          // Node.js will throw an error about the invalid URL since this is a server component
          outdent`
          export default function Page() {
            new URL("/", "invalid");
          }`,
        ],
      ])
    )
    const { browser } = sandbox

    await expect(browser).toDisplayRedbox(`
     {
       "description": "Invalid URL",
       "environmentLabel": "Server",
       "label": "Runtime TypeError",
       "source": "app/page.js (2:3) @ Page
     > 2 |   new URL("/", "invalid");
         |   ^",
       "stack": [
         "Page app/page.js (2:3)",
       ],
     }
    `)
  })

  test('Server component errors should open up in fullscreen', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        // Start with error
        [
          'app/page.js',
          outdent`
            export default function Page() {
              throw new Error('Server component error')
              return <p id="text">Hello world</p>
            }
          `,
        ],
      ])
    )
    const { session, browser } = sandbox

    await expect(browser).toDisplayRedbox(
      `
     {
       "description": "Server component error",
       "environmentLabel": "Server",
       "label": "<FIXME-excluded-label>",
       "source": "app/page.js (2:9) @ Page
     > 2 |   throw new Error('Server component error')
         |         ^",
       "stack": [
         "Page app/page.js (2:9)",
       ],
     }
    `,

      // FIXME: `label` is flaking between "Runtime Error" and "Recoverable Error"
      { label: false }
    )

    // Remove error
    await session.patch(
      'app/page.js',
      outdent`
        export default function Page() {
          return <p id="text">Hello world</p>
        }
      `
    )
    expect(await browser.waitForElementByCss('#text').text()).toBe(
      'Hello world'
    )
    await session.assertNoRedbox()

    // Re-add error
    await session.patch(
      'app/page.js',
      outdent`
        export default function Page() {
          throw new Error('Server component error!')
          return <p id="text">Hello world</p>
        }
      `
    )

    await expect(browser).toDisplayRedbox(
      `
     {
       "description": "Server component error!",
       "environmentLabel": "Server",
       "label": "<FIXME-excluded-label>",
       "source": "app/page.js (2:9) @ Page
     > 2 |   throw new Error('Server component error!')
         |         ^",
       "stack": [
         "Page app/page.js (2:9)",
       ],
     }
    `,

      // FIXME: `label` is flaking between "Runtime Error" and "Recoverable Error"
      { label: false }
    )
  })

  test('Import trace when module not found in layout', async () => {
    await using sandbox = await createSandbox(
      next,

      new Map([['app/module.js', `import "non-existing-module"`]])
    )
    const { browser, session } = sandbox

    await session.patch(
      'app/layout.js',
      outdent`
        import "./module"

        export default function RootLayout({ children }) {
          return (
            <html>
              <head></head>
              <body>{children}</body>
            </html>
          )
        }
      `
    )

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve 'non-existing-module'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/module.js (1:1)
       Module not found: Can't resolve 'non-existing-module'
       > 1 | import "non-existing-module"
           | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  × Module not found: Can't resolve 'non-existing-module' in '<FIXME-project-root>/app'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/module.js
         × Module not found: Can't resolve 'non-existing-module' in '<FIXME-project-root>/app'
          ╭────
        1 │ import "non-existing-module";
          ·        ─────────────────────
          ╰────
       Import trace for requested module:
       ./app/module.js
       ./app/layout.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve 'non-existing-module'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/module.js (1:1)
       Module not found: Can't resolve 'non-existing-module'
       > 1 | import "non-existing-module"
           | ^",
         "stack": [],
       }
      `)
    }
  })

  test("Can't resolve @import in CSS file", async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        ['app/styles1.css', '@import "./styles2.css"'],
        ['app/styles2.css', '@import "./boom.css"'],
      ])
    )
    const { browser, session } = sandbox
    await session.patch(
      'app/layout.js',
      outdent`
        import "./styles1.css"

        export default function RootLayout({ children }) {
          return (
            <html>
              <head></head>
              <body>{children}</body>
            </html>
          )
        }
      `
    )

    // Wait for patch to apply and new error to show.
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve './boom.css'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/styles2.css (1:2)
       Module not found: Can't resolve './boom.css'
       > 1 | @import "./boom.css"
           |  ^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  ╰─▶   × Error: RspackResolver(NotFound("./boom.css"))",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "× Module build failed:
         ╰─▶   × Error: RspackResolver(NotFound("./boom.css"))",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Module not found: Can't resolve './boom.css'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/styles2.css
       Module not found: Can't resolve './boom.css'
       https://nextjs.org/docs/messages/module-not-found
       Import trace for requested module:
       ./app/styles1.css",
         "stack": [],
       }
      `)
    }
  })

  // TODO: The error overlay is not closed when restoring the working code.
  for (const type of ['server' /* , 'client' */]) {
    test(`${type} component can recover from error thrown in the module`, async () => {
      await using sandbox = await createSandbox(next, undefined, '/' + type)
      const { browser, session } = sandbox

      await next.patchFile('index.js', "throw new Error('module error')")

      await retry(async () => {
        // Should use `await expect(browser).toDisplayRedbox()`
        await session.assertHasRedbox()
      })

      if (isRspack) {
        await expect({ browser, next }).toDisplayRedbox(`
         {
           "description": "module error",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (1:7) @ eval
         > 1 | throw new Error('module error')
             |       ^",
           "stack": [
             "eval index.js (1:7)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "eval ./app/server/page.js",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else if (!isTurbopack) {
        await expect({ browser, next }).toDisplayRedbox(`
         {
           "description": "module error",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (1:7) @ eval
         > 1 | throw new Error('module error')
             |       ^",
           "stack": [
             "eval index.js (1:7)",
             "<FIXME-next-dist-dir>",
             "eval ./app/server/page.js",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      }

      await next.patchFile(
        'index.js',
        'export default function Page() {return <p>hello world</p>}'
      )
      await session.assertNoRedbox()
    })
  }

  test('Should show error location for server actions in client component', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/actions.ts',
          `"use server";

export async function serverAction(a) {
  throw new Error("server action was here");
}`,
        ],
        [
          'app/page.js',
          `"use client";
import { serverAction } from "./actions";

export default function Home() {
  return (
    <>
      <form action={serverAction}>
        <button id="trigger-action">Submit</button>
      </form>
    </>
  );
}`,
        ],
      ])
    )
    const { browser } = sandbox
    await browser.elementByCss('#trigger-action').click()

    await expect(browser).toDisplayRedbox(`
     {
       "description": "server action was here",
       "environmentLabel": "Server",
       "label": "Runtime Error",
       "source": "app/actions.ts (4:9) @ serverAction
     > 4 |   throw new Error("server action was here");
         |         ^",
       "stack": [
         "serverAction app/actions.ts (4:9)",
         "form <anonymous>",
         "Home app/page.js (7:7)",
       ],
     }
    `)
  })

  test('Should show error location for server actions in server component', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/actions.ts',
          `"use server";

export async function serverAction(a) {
  throw new Error("server action was here");
}`,
        ],
        [
          'app/page.js',
          `import { serverAction } from "./actions";

export default function Home() {
  return (
    <>
      <form action={serverAction}>
        <button id="trigger-action">Submit</button>
      </form>
    </>
  );
}`,
        ],
      ])
    )
    const { browser } = sandbox
    await browser.elementByCss('#trigger-action').click()

    await expect(browser).toDisplayRedbox(`
     {
       "description": "server action was here",
       "environmentLabel": "Server",
       "label": "Runtime Error",
       "source": "app/actions.ts (4:9) @ serverAction
     > 4 |   throw new Error("server action was here");
         |         ^",
       "stack": [
         "serverAction app/actions.ts (4:9)",
         "form <anonymous>",
         "Home app/page.js (6:7)",
       ],
     }
    `)
  })

  test('should collapse bundler internal stack frames', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/utils.ts',
          `throw new Error('utils error')
export function foo(){}
          `,
        ],
        [
          'app/page.js',
          `"use client";
import { foo } from "./utils";

export default function Home() {
  foo();
  return "hello";
}`,
        ],
      ])
    )

    const { browser } = sandbox

    if (isTurbopack) {
      // FIXME: display the sourcemapped stack frames
      await expect(browser).toDisplayRedbox(`
       {
         "description": "utils error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/utils.ts (1:7) @ module evaluation
       > 1 | throw new Error('utils error')
           |       ^",
         "stack": [
           "module evaluation app/utils.ts (1:7)",
           "module evaluation app/page.js (2:1)",
         ],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "utils error",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/utils.ts (1:7) @ eval
       > 1 | throw new Error('utils error')
           |       ^",
         "stack": [
           "eval app/utils.ts (1:7)",
           "<FIXME-next-dist-dir>",
           "<FIXME-next-dist-dir>",
           "<FIXME-next-dist-dir>",
           "eval ./app/page.js",
           "<FIXME-next-dist-dir>",
           "<FIXME-next-dist-dir>",
           "<FIXME-next-dist-dir>",
         ],
       }
      `)
    } else {
      // FIXME: Webpack stack frames are not source mapped
      await expect(browser).toDisplayRedbox(`
       [
         {
           "description": "utils error",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/utils.ts (1:7) @ eval
       > 1 | throw new Error('utils error')
           |       ^",
           "stack": [
             "eval app/utils.ts (1:7)",
             "<FIXME-next-dist-dir>",
             "eval ./app/page.js",
             "<FIXME-next-dist-dir>",
           ],
         },
         {
           "description": "utils error",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/utils.ts (1:7) @ eval
       > 1 | throw new Error('utils error')
           |       ^",
           "stack": [
             "eval app/utils.ts (1:7)",
             "<FIXME-next-dist-dir>",
             "eval ./app/page.js",
             "<FIXME-next-dist-dir>",
           ],
         },
       ]
      `)
    }
  })
})
