/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  describeVariants as describe,
  getStackFramesContent,
  retry,
  getRedboxCallStack,
  getToastErrorCount,
} from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

describe.each(['default', 'turbo'])('ReactRefreshLogBox app %s', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
    patchFileDelay: 1000,
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

    await session.openRedbox()
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
    if (process.platform === 'win32') {
      expect(await session.getRedboxSource()).toMatchSnapshot()
    } else {
      expect(await session.getRedboxSource()).toMatchSnapshot()
    }
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

    await session.openRedbox()
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
        }
      `
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
    if (isTurbopack) {
      expect(source).toEqual(outdent`
        ./index.js (7:1)
        Parsing ecmascript source code failed
          5 |     div
          6 |   )
        > 7 | }
            | ^

        Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
      `)
    } else {
      expect(source).toEqual(outdent`
        ./index.js
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
        ./app/page.js
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
      isTurbopack ? './index.module.css (1:9)' : './index.module.css (1:1)'
    )
    if (!isTurbopack) {
      expect(source).toMatch('Syntax error: ')
      expect(source).toMatch('Unknown word')
    }
    expect(source).toMatch('> 1 | .button')
    expect(source).toMatch(isTurbopack ? '    |         ^' : '    | ^')

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

    await session.evaluate(() => document.querySelector('button').click())
    await session.openRedbox()

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

    await session.evaluate(() => document.querySelector('button').click())
    await session.assertHasRedbox()

    const header4 = await session.getRedboxDescription()
    expect(header4).toEqual(
      `Error: multiple https://nextjs.org links http://example.com`
    )
    // Do not highlight example.com but do highlight nextjs.org
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

  // TODO-APP: Catch errors that happen before useEffect
  test.skip('non-Error errors are handled properly', async () => {
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
    expect(await session.getRedboxDescription()).toEqual(
      `Error: {"a":1,"b":"x"}`
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
    expect(await session.getRedboxDescription()).toEqual(`Error: string error`)

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

  test('Should not show __webpack_exports__ when exporting anonymous arrow function', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toMatchSnapshot()
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
    expect(await getToastErrorCount(browser)).toBe(2)

    // Unhandled error in event handler
    await browser.elementById('unhandled-error').click()
    expect(await getToastErrorCount(browser)).toBe(3)

    // Unhandled rejection in event handler
    await browser.elementById('unhandled-rejection').click()
    expect(await getToastErrorCount(browser)).toBe(4)
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
    await session.assertHasRedbox()
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
    const { session, browser } = sandbox

    await session.assertHasRedbox()

    // Should still show the errored line in source code
    const source = await session.getRedboxSource()
    expect(source).toContain('app/page.js')
    expect(source).toContain(`throw new Error('Client error')`)

    await getRedboxCallStack(browser)

    const stackFrameElements = await browser.elementsByCss(
      '[data-nextjs-call-stack-frame]'
    )
    const stackFrames = (
      await Promise.all(stackFrameElements.map((f) => f.innerText()))
    ).filter(Boolean)
    expect(stackFrames).toEqual([
      outdent`
        Page
        app/page.js (4:11)
      `,
    ])
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
    const { session, browser } = sandbox

    await session.assertHasRedbox()

    // Should still show the errored line in source code
    const source = await session.getRedboxSource()
    expect(source).toContain('app/page.js')
    expect(source).toContain(`throw new Error('Server error')`)

    await getRedboxCallStack(browser)

    const stackFrameElements = await browser.elementsByCss(
      '[data-nextjs-call-stack-frame]'
    )
    const stackFrames = (
      await Promise.all(stackFrameElements.map((f) => f.innerText()))
    ).filter(Boolean)
    expect(stackFrames).toEqual([
      outdent`
        Page
        app/page.js (2:9)
      `,
    ])
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
    const { session, browser } = sandbox

    await session.assertHasRedbox()

    // Should still show the errored line in source code
    const source = await session.getRedboxSource()
    if (isTurbopack) {
      expect(source).toMatchSnapshot()
    } else {
      expect(source).toMatchSnapshot()
    }

    await getRedboxCallStack(browser)

    const stackFrameElements = await browser.elementsByCss(
      '[data-nextjs-call-stack-frame]'
    )
    const stackFrames = await Promise.all(
      stackFrameElements.map((f) => f.innerText())
    )
    expect(stackFrames).toEqual(
      // TODO: investigate the column number is off by 1 between turbo and webpack
      process.env.TURBOPACK
        ? [
            outdent`
                <anonymous>
                app/page.js (4:13)
              `,
            outdent`
                Page
                app/page.js (5:6)
              `,
          ]
        : [
            outdent`
                eval
                app/page.js (4:13)
              `,
            outdent`
                Page
                app/page.js (5:5)
              `,
          ]
    )
  })

  test('should hide unrelated frames in stack trace with nodejs internal calls', async () => {
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
    const { session, browser } = sandbox

    await session.assertHasRedbox()

    // Should still show the errored line in source code
    const source = await session.getRedboxSource()
    if (isTurbopack) {
      expect(source).toMatchSnapshot()
    } else {
      expect(source).toMatchSnapshot()
    }

    await getRedboxCallStack(browser)

    const stackFrameElements = await browser.elementsByCss(
      '[data-nextjs-call-stack-frame]'
    )
    const stackFrames = await Promise.all(
      stackFrameElements.map((f) => f.innerText())
    )

    // No ignore-listed frames to be displayed by default
    expect(stackFrames.length).toBe(1)
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

    await session.assertHasRedbox()

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

    await session.assertHasRedbox()
  })

  test('Import trace when module not found in layout', async () => {
    await using sandbox = await createSandbox(
      next,

      new Map([['app/module.js', `import "non-existing-module"`]])
    )
    const { session } = sandbox

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

    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toMatchSnapshot()
  })

  test("Can't resolve @import in CSS file", async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        ['app/styles1.css', '@import "./styles2.css"'],
        ['app/styles2.css', '@import "./boom.css"'],
      ])
    )
    const { session } = sandbox
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
    await session.assertHasRedbox()
    if (isTurbopack) {
      expect(await session.getRedboxSource()).toEqual(outdent`
          ./app/styles2.css (1:2)
          Module not found: Can't resolve './boom.css'
          > 1 | @import "./boom.css"
              |  ^
          
          https://nextjs.org/docs/messages/module-not-found
        `)
    } else {
      expect(await session.getRedboxSource()).toEqual(outdent`
          ./app/styles2.css
          Module not found: Can't resolve './boom.css'
          
          https://nextjs.org/docs/messages/module-not-found
          
          Import trace for requested module:
          ./app/styles1.css
        `)
    }
  })

  // TODO: The error overlay is not closed when restoring the working code.
  for (const type of ['server' /* , 'client' */]) {
    test(`${type} component can recover from error thrown in the module`, async () => {
      await using sandbox = await createSandbox(next, undefined, '/' + type)
      const { session } = sandbox

      await next.patchFile('index.js', "throw new Error('module error')")
      await session.assertHasRedbox()
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
    const { session, browser } = sandbox
    await browser.elementByCss('#trigger-action').click()

    // Wait for patch to apply and new error to show.
    await session.assertHasRedbox()
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "app/actions.ts (4:9) @ serverAction

          2 |
          3 | export async function serverAction(a) {
        > 4 |   throw new Error("server action was here");
            |         ^
          5 | }"
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
    const { session, browser } = sandbox
    await browser.elementByCss('#trigger-action').click()

    // Wait for patch to apply and new error to show.
    await session.assertHasRedbox()
    await retry(async () => {
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "app/actions.ts (4:9) @ serverAction

          2 |
          3 | export async function serverAction(a) {
        > 4 |   throw new Error("server action was here");
            |         ^
          5 | }"
      `)
    })
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

    const { session, browser } = sandbox

    await session.assertHasRedbox()

    const source = await session.getRedboxSource()
    const stackFrames = await getStackFramesContent(browser)

    if (isTurbopack) {
      expect(source).toMatchInlineSnapshot(`
        "app/utils.ts (1:7) @ [project]/app/utils.ts [app-client] (ecmascript)

        > 1 | throw new Error('utils error')
            |       ^
          2 | export function foo(){}
          3 |           "
      `)
    } else {
      expect(source).toMatchInlineSnapshot(`
        "app/utils.ts (1:7) @ eval

        > 1 | throw new Error('utils error')
            |       ^
          2 | export function foo(){}
          3 |           "
      `)
    }

    if (isTurbopack) {
      // FIXME: display the sourcemapped stack frames
      expect(stackFrames).toMatchInlineSnapshot(`
       "at [project]/app/utils.ts [app-client] (ecmascript) (app/utils.ts (1:7))
       at [project]/app/page.js [app-client] (ecmascript) (app/page.js (2:1))"
      `)
    } else {
      // FIXME: Webpack stack frames are not source mapped
      expect(stackFrames).toMatchInlineSnapshot(`
        "at eval (app/utils.ts (1:7))
        at ./app/utils.ts ()
        at options.factory ()
        at __webpack_require__ ()
        at fn ()
        at eval ()
        at ./app/page.js ()
        at options.factory ()
        at __webpack_require__ ()
        at fn ()"
      `)
    }
  })
})
