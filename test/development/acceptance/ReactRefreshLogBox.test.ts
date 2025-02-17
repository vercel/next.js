/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  describeVariants as describe,
  getStackFramesContent,
  toggleCollapseCallStackFrames,
  hasRedboxCallStack,
} from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

describe.each(['default', 'turbo'])('ReactRefreshLogBox %s', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  test('should strip whitespace correctly with newline', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toMatchSnapshot()
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137807
  test('module init error not shown', async () => {
    // Start here:
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toMatchSnapshot()
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554152127
  test('boundaries', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toMatchSnapshot()
    expect(
      await session.evaluate(() => document.querySelector('h2').textContent)
    ).toBe('error')
  })

  // TODO: investigate why this fails when running outside of the Next.js
  // monorepo e.g. fails when using pnpm create next-app
  // https://github.com/vercel/next.js/pull/23203
  test.skip('internal package errors', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

    // Make a react build-time error.
    await session.patch(
      'index.js',
      outdent`
        export default function FunctionNamed() {
          return <div>{{}}</div>
        }`
    )

    await session.assertHasRedbox()
    // We internally only check the script path, not including the line number
    // and error message because the error comes from an external library.
    // This test ensures that the errored script path is correctly resolved.
    expect(await session.getRedboxSource()).toContain(
      `../../../../packages/next/dist/pages/_document.js`
    )
  })

  test('unterminated JSX', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertHasRedbox()
    const source = next.normalizeTestDirContent(await session.getRedboxSource())
    if (process.env.TURBOPACK) {
      expect(source).toMatchInlineSnapshot(`
       "./index.js (7:1)
       Parsing ecmascript source code failed
         5 |     div
         6 |   )
       > 7 | }
           | ^

       Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?"
      `)
    } else {
      expect(source).toMatchInlineSnapshot(`
        "./index.js
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
        ./pages/index.js"
      `)
    }
  })

  // Module trace is only available with webpack 5
  test('conversion to class component (1)', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toMatchSnapshot()

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
    const { session } = sandbox

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
    await session.assertHasRedbox()
    const source = await session.getRedboxSource()
    expect(source).toMatch(
      process.env.TURBOPACK
        ? './index.module.css (1:9)'
        : './index.module.css (1:1)'
    )
    if (!process.env.TURBOPACK) {
      expect(source).toMatch('Syntax error: ')
      expect(source).toMatch('Unknown word')
    }
    if (process.env.TURBOPACK) {
      expect(source).toMatch('> 1 | .button')
      expect(source).toMatch('    |        ')
    } else {
      expect(source).toMatch('> 1 | .button')
      expect(source).toMatch('    | ^')
    }

    // Checks for selectors that can't be prefixed.
    // Selector "button" is not pure (pure selectors must contain at least one local class or id)
    await session.patch('index.module.css', `button {}`)
    await session.assertHasRedbox()
    const source2 = await session.getRedboxSource()
    expect(source2).toMatchSnapshot()
  })

  test('logbox: anchors links in error messages', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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
    await session.assertHasRedbox()

    const header = await session.getRedboxDescription()
    expect(header).toMatchSnapshot()
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body > nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchSnapshot()

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
    await session.assertHasRedbox()

    const header2 = await session.getRedboxDescription()
    expect(header2).toMatchSnapshot()
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body > nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchSnapshot()

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
    await session.assertHasRedbox()

    const header3 = await session.getRedboxDescription()
    expect(header3).toMatchSnapshot()
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body > nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchSnapshot()

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
    await session.assertHasRedbox()

    const header4 = await session.getRedboxDescription()
    expect(header4).toMatchInlineSnapshot(
      `"Error: multiple https://nextjs.org links http://example.com"`
    )
    // Do not highlight the http://example.com link
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body > nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchSnapshot()
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(2)'
              ) as any
          ).href
      )
    ).toBe(null)

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
    await session.assertHasRedbox()

    const header5 = await session.getRedboxDescription()
    expect(header5).toMatchInlineSnapshot(
      `"Error: multiple https://nextjs.org links (http://example.com)"`
    )
    // Do not highlight the http://example.com link
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body > nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(1)
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatchSnapshot()
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(2)'
              ) as any
          ).href
      )
    ).toBe(null)
  })

  test('non-Error errors are handled properly', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Error: {"a":1,"b":"x"}"`
    )

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
    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toContain(
      `Error: class Hello {`
    )

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
    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Error: string error"`
    )

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
    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toContain(
      `Error: A null error was thrown`
    )
  })

  test('Call stack count is correct for pages error', async () => {
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
    const { session, browser } = sandbox
    await session.assertHasRedbox()

    await toggleCollapseCallStackFrames(browser)

    // Expect more than the default amount of frames
    // The default stackTraceLimit results in max 9 [data-nextjs-call-stack-frame] elements
    await hasRedboxCallStack(browser)
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

    const { session, browser } = sandbox

    await session.assertHasRedbox()

    const stack = await getStackFramesContent(browser)
    if (process.env.TURBOPACK) {
      expect(stack).toMatchInlineSnapshot(`
       "at <unknown> (pages/index.js (3:11))
       at Array.map ()
       at Page (pages/index.js (2:13))"
      `)
    } else {
      expect(stack).toMatchInlineSnapshot(`
       "at eval (pages/index.js (3:11))
       at Array.map ()
       at Page (pages/index.js (2:13))"
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

    const { session, browser } = sandbox
    await session.assertHasRedbox()

    const stack = await getStackFramesContent(browser)
    expect(stack).toMatchInlineSnapshot(`
     "at createURL (pages/index.js (4:3))
     at getServerSideProps (pages/index.js (8:3))"
    `)

    await toggleCollapseCallStackFrames(browser)
    const stackCollapsed = await getStackFramesContent(browser)
    expect(stackCollapsed).toContain('at new URL ()')
  })
})
