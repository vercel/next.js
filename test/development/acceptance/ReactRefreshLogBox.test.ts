/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { describeVariants as describe } from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

describe.each(['default', 'turbo'])('ReactRefreshLogBox %s', (variant) => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  test('should strip whitespace correctly with newline', async () => {
    const { session, cleanup } = await sandbox(next)

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

    expect(await session.hasRedbox(true)).toBe(true)
    if (variant === 'default') {
      // TODO(WEB-1095): turbopack doesn't display a code frame along with the stack trace
      expect(await session.getRedboxSource()).toMatchSnapshot()
    }

    await cleanup()
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137807
  test('module init error not shown', async () => {
    // Start here:
    const { session, cleanup } = await sandbox(next)

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

    // Add a `throw` in module init phase:
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

    expect(await session.hasRedbox(true)).toBe(true)
    if (variant === 'default') {
      expect(await session.getRedboxSource()).toMatchSnapshot()
    } else {
      // can't use a snapshot because we currently display the whole stack trace in the turbopack error overlay.
      expect(await session.getRedboxSource()).toContain(
        'return <h1>Default Export</h1>;'
      )
    }

    await cleanup()
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554152127
  test('boundaries', async () => {
    const { session, cleanup } = await sandbox(next)

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

    expect(await session.hasRedbox(true)).toBe(true)
    if (variant === 'default') {
      // TODO(WEB-1095): turbopack doesn't display a code frame along with the stack trace
      expect(await session.getRedboxSource()).toMatchSnapshot()
    }
    expect(
      await session.evaluate(() => document.querySelector('h2').textContent)
    ).toBe('error')

    await cleanup()
  })

  // TODO: investigate why this fails when running outside of the Next.js
  // monorepo e.g. fails when using yarn create next-app
  // https://github.com/vercel/next.js/pull/23203
  test.skip('internal package errors', async () => {
    const { session, cleanup } = await sandbox(next)

    // Make a react build-time error.
    await session.patch(
      'index.js',
      outdent`
        export default function FunctionNamed() {
          return <div>{{}}</div>
        }
      `
    )

    expect(await session.hasRedbox(true)).toBe(true)
    // We internally only check the script path, not including the line number
    // and error message because the error comes from an external library.
    // This test ensures that the errored script path is correctly resolved.
    expect(await session.getRedboxSource()).toContain(
      `../../../../packages/next/dist/pages/_document.js`
    )

    await cleanup()
  })

  test('unterminated JSX', async () => {
    const { session, cleanup } = await sandbox(next)

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

    expect(await session.hasRedbox(false)).toBe(false)

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

    expect(await session.hasRedbox(true)).toBe(true)

    const source = await session.getRedboxSource()
    if (variant === 'default') {
      expect(next.normalizeTestDirContent(source)).toMatchInlineSnapshot(
        next.normalizeSnapshot(`
          "./index.js
          Error: 
            x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
             ,-[TEST_DIR/index.js:4:1]
           4 |       <p>lol</p>
           5 |     div
           6 |   )
           7 | }
             : ^
             \`----

            x Unexpected eof
             ,-[TEST_DIR/index.js:4:1]
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
      )
    } else {
      expect(next.normalizeTestDirContent(source)).toMatchInlineSnapshot(`
        "error - [parse] [project]/index.js  /index.js:7:1  Parsing ecmascript source code failed
               3 |     <div>
               4 |       <p>lol</p>
               5 |     div
               6 |   )
                 +  v
               7 + }
                 +  ^
          
          Unexpected eof
          
        "
      `)
    }

    await cleanup()
  })

  // Module trace is only available with webpack 5
  test('conversion to class component (1)', async () => {
    const { session, cleanup } = await sandbox(next)

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

    expect(await session.hasRedbox(false)).toBe(false)
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

    expect(await session.hasRedbox(true)).toBe(true)
    if (variant === 'default') {
      // TODO(WEB-1095): turbopack doesn't display a code frame along with the stack trace
      expect(await session.getRedboxSource()).toMatchSnapshot()
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

    expect(await session.hasRedbox(false)).toBe(false)
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('hello new')

    await cleanup()
  })

  test('css syntax errors', async () => {
    const { session, cleanup } = await sandbox(next)

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

    expect(await session.hasRedbox(false)).toBe(false)

    // Syntax error
    await session.patch('index.module.css', `.button {`)
    expect(await session.hasRedbox(true)).toBe(true)

    const source = await session.getRedboxSource()
    if (variant === 'default') {
      expect(source).toMatch('./index.module.css:1:1')
      expect(source).toMatch('Syntax error: ')
      expect(source).toMatch('Unclosed block')
      expect(source).toMatch('> 1 | .button {')
      expect(source).toMatch('    | ^')
    } else {
      expect(source).toMatch('/index.module.css:1:8')
      expect(source).toMatch('Parsing css source code failed')
      expect(source).toMatch('1 + .button {')
      expect(source).toMatch('  +         ^')
      expect(source).toMatch("Unexpected end of file, but expected '}'")
    }

    // Not local error
    if (variant === 'default') {
      await session.patch('index.module.css', `button {}`)
      expect(await session.hasRedbox(true)).toBe(true)
      const source2 = await session.getRedboxSource()
      expect(source2).toMatchSnapshot()
    } else {
      // TODO(WEB-XXX): implement for turbopack
    }

    await cleanup()
  })

  test('logbox: anchors links in error messages', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      outdent`
        import { useCallback } from 'react'

        export default function Index() {
          const boom = useCallback(() => {
            throw new Error('end http://nextjs.org')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    expect(await session.hasRedbox(false)).toBe(false)
    await session.evaluate(() => document.querySelector('button').click())
    expect(await session.hasRedbox(true)).toBe(true)

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
            throw new Error('http://nextjs.org start')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    expect(await session.hasRedbox(false)).toBe(false)
    await session.evaluate(() => document.querySelector('button').click())
    expect(await session.hasRedbox(true)).toBe(true)

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
            throw new Error('middle http://nextjs.org end')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    expect(await session.hasRedbox(false)).toBe(false)
    await session.evaluate(() => document.querySelector('button').click())
    expect(await session.hasRedbox(true)).toBe(true)

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
            throw new Error('multiple http://nextjs.org links http://example.com')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    expect(await session.hasRedbox(false)).toBe(false)
    await session.evaluate(() => document.querySelector('button').click())
    expect(await session.hasRedbox(true)).toBe(true)

    const header4 = await session.getRedboxDescription()
    expect(header4).toMatchInlineSnapshot(
      `"Error: multiple http://nextjs.org links http://example.com"`
    )
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body > nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(2)
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
    ).toMatchSnapshot()

    await session.patch(
      'index.js',
      outdent`
        import { useCallback } from 'react'

        export default function Index() {
          const boom = useCallback(() => {
            throw new Error('multiple http://nextjs.org links (http://example.com)')
          }, [])
          return (
            <main>
              <button onClick={boom}>Boom!</button>
            </main>
          )
        }
      `
    )

    expect(await session.hasRedbox(false)).toBe(false)
    await session.evaluate(() => document.querySelector('button').click())
    expect(await session.hasRedbox(true)).toBe(true)

    const header5 = await session.getRedboxDescription()
    expect(header5).toMatchInlineSnapshot(
      `"Error: multiple http://nextjs.org links (http://example.com)"`
    )
    expect(
      await session.evaluate(
        () =>
          document
            .querySelector('body > nextjs-portal')
            .shadowRoot.querySelectorAll('#nextjs__container_errors_desc a')
            .length
      )
    ).toBe(2)
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
    ).toMatchSnapshot()

    await cleanup()
  })

  test('non-Error errors are handled properly', async () => {
    const { session, cleanup } = await sandbox(next)

    // TODO: turbopack should also display it in the description
    function getErrorText() {
      return variant === 'turbo'
        ? session.getRedboxSource()
        : session.getRedboxDescription()
    }

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

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await getErrorText()).toContain(`Error: {"a":1,"b":"x"}`)

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
    expect(await session.hasRedbox(false)).toBe(false)
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
    expect(await session.hasRedbox(true)).toBe(true)
    expect(await getErrorText()).toContain(`Error: class Hello {`)

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
    expect(await session.hasRedbox(false)).toBe(false)
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
    expect(await session.hasRedbox(true)).toBe(true)
    expect(await getErrorText()).toContain(`Error: string error`)

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
    expect(await session.hasRedbox(false)).toBe(false)
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
    expect(await session.hasRedbox(true)).toBe(true)
    expect(await getErrorText()).toContain(
      variant === 'default'
        ? `Error: A null error was thrown`
        : `Error: \`null\` was thrown instead of a real error`
    )

    await cleanup()
  })
})
