/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { check, describeVariants as describe } from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

describe.each(['default', 'turbo'])('ReactRefreshLogBox app %s', (variant) => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
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

    await session.waitForAndOpenRuntimeError()
    expect(await session.getRedboxSource()).toMatchSnapshot()

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
      if (process.platform === 'win32') {
        expect(await session.getRedboxSource()).toMatchSnapshot()
      } else {
        expect(await session.getRedboxSource()).toMatchSnapshot()
      }
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

    await session.waitForAndOpenRuntimeError()
    expect(await session.getRedboxSource()).toMatchSnapshot()
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
          ./app/page.js"
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
      expect(source).toMatch('./index.module.css (1:1)')
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

    await session.evaluate(() => document.querySelector('button').click())
    await session.waitForAndOpenRuntimeError()

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

    await session.evaluate(() => document.querySelector('button').click())
    await session.waitForAndOpenRuntimeError()

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

    await session.evaluate(() => document.querySelector('button').click())
    await session.waitForAndOpenRuntimeError()

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

    await session.evaluate(() => document.querySelector('button').click())
    await session.waitForAndOpenRuntimeError()

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

    await cleanup()
  })

  // TODO-APP: Catch errors that happen before useEffect
  test.skip('non-Error errors are handled properly', async () => {
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
    expect(await getErrorText()).toContain(`Error: A null error was thrown`)

    await cleanup()
  })

  test('Should not show __webpack_exports__ when exporting anonymous arrow function', async () => {
    const { session, cleanup } = await sandbox(next)

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

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxSource()).toMatchSnapshot()

    await cleanup()
  })

  test('Unhandled errors and rejections opens up in the minimized state', async () => {
    const { session, browser, cleanup } = await sandbox(next)

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
    expect(
      await browser.waitForElementByCss('.nextjs-toast-errors').text()
    ).toBe('2 errors')

    // Unhandled error in event handler
    await browser.elementById('unhandled-error').click()
    await check(
      () => browser.elementByCss('.nextjs-toast-errors').text(),
      /3 errors/
    )

    // Unhandled rejection in event handler
    await browser.elementById('unhandled-rejection').click()
    await check(
      () => browser.elementByCss('.nextjs-toast-errors').text(),
      /4 errors/
    )
    expect(await session.hasRedbox(false)).toBe(false)

    // Add Component error
    await session.patch(
      'index.js',
      file.replace(
        '//',
        "if (typeof window !== 'undefined') throw new Error('Component error')"
      )
    )

    // Render error should "win" and show up in fullscreen
    expect(await session.hasRedbox(true)).toBe(true)

    await cleanup()
  })

  test.each(['server', 'client'])(
    'Call stack count is correct for %s error',
    async (pageType) => {
      const fixture =
        pageType === 'server'
          ? new Map([
              [
                'app/page.js',
                outdent`
                  export default function Page() {
                    throw new Error('Server error')
                  }
                `,
              ],
            ])
          : new Map([
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

      const { session, browser, cleanup } = await sandbox(next, fixture)

      const getCallStackCount = async () =>
        (await browser.elementsByCss('[data-nextjs-call-stack-frame]')).length

      expect(await session.hasRedbox(true)).toBe(true)

      // Open full Call Stack
      await browser
        .elementByCss('[data-nextjs-data-runtime-error-collapsed-action]')
        .click()

      // Expect more than the default amount of frames
      // The default stackTraceLimit results in max 9 [data-nextjs-call-stack-frame] elements
      expect(await getCallStackCount()).toBeGreaterThan(9)

      await cleanup()
    }
  )

  test('Server component errors should open up in fullscreen', async () => {
    const { session, browser, cleanup } = await sandbox(
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
    expect(await session.hasRedbox(true)).toBe(true)

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
    expect(await session.hasRedbox(false)).toBe(false)

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

    expect(await session.hasRedbox(true)).toBe(true)

    await cleanup()
  })

  test('Import trace when module not found in layout', async () => {
    const { session, cleanup } = await sandbox(
      next,

      new Map([['app/module.js', `import "non-existing-module"`]])
    )

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

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxSource()).toMatchSnapshot()

    await cleanup()
  })

  test("Can't resolve @import in CSS file", async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([
        ['app/styles1.css', '@import "./styles2.css"'],
        ['app/styles2.css', '@import "./boom.css"'],
      ])
    )

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

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxSource()).toMatchSnapshot()

    await cleanup()
  })

  test.each([['server'], ['client']])(
    '%s component can recover from error thrown in the module',
    async (type: string) => {
      const { session, cleanup } = await sandbox(next, undefined, '/' + type)

      await next.patchFile('index.js', "throw new Error('module error')")
      expect(await session.hasRedbox(true)).toBe(true)
      await next.patchFile(
        'index.js',
        'export default function Page() {return <p>hello world</p>}'
      )
      expect(await session.hasRedbox(false)).toBe(false)

      await cleanup()
    }
  )
})
