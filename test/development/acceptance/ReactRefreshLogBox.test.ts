/* eslint-env jest */
import { sandbox } from './helpers'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, getSnapshotTestDescribe } from 'next-test-utils'

for (const variant of ['default', 'turbo']) {
  getSnapshotTestDescribe(variant)(`ReactRefreshLogBox ${variant}`, () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {},
        skipStart: true,
      })
    })
    afterAll(() => next.destroy())

    test('should strip whitespace correctly with newline', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.patch(
        'index.js',
        `
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
      expect(await session.getRedboxSource()).toMatchSnapshot()

      await cleanup()
    })

    test('logbox: can recover from a syntax error without losing state', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.patch(
        'index.js',
        `
        import { useCallback, useState } from 'react'

        export default function Index() {
          const [count, setCount] = useState(0)
          const increment = useCallback(() => setCount(c => c + 1), [setCount])
          return (
            <main>
              <p>{count}</p>
              <button onClick={increment}>Increment</button>
            </main>
          )
        }
      `
      )

      await session.evaluate(() => document.querySelector('button').click())
      expect(
        await session.evaluate(() => document.querySelector('p').textContent)
      ).toBe('1')

      await session.patch('index.js', `export default () => <div/`)

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchSnapshot()

      await session.patch(
        'index.js',
        `
        import { useCallback, useState } from 'react'

        export default function Index() {
          const [count, setCount] = useState(0)
          const increment = useCallback(() => setCount(c => c + 1), [setCount])
          return (
            <main>
              <p>Count: {count}</p>
              <button onClick={increment}>Increment</button>
            </main>
          )
        }
      `
      )

      await check(
        () => session.evaluate(() => document.querySelector('p').textContent),
        /Count: 1/
      )

      expect(await session.hasRedbox(false)).toBe(false)

      await cleanup()
    })

    test('logbox: can recover from a event handler error', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.patch(
        'index.js',
        `
        import { useCallback, useState } from 'react'

        export default function Index() {
          const [count, setCount] = useState(0)
          const increment = useCallback(() => {
            setCount(c => c + 1)
            throw new Error('oops')
          }, [setCount])
          return (
            <main>
              <p>{count}</p>
              <button onClick={increment}>Increment</button>
            </main>
          )
        }
      `
      )

      expect(
        await session.evaluate(() => document.querySelector('p').textContent)
      ).toBe('0')
      await session.evaluate(() => document.querySelector('button').click())
      expect(
        await session.evaluate(() => document.querySelector('p').textContent)
      ).toBe('1')

      expect(await session.hasRedbox(true)).toBe(true)
      if (process.platform === 'win32') {
        expect(await session.getRedboxSource()).toMatchSnapshot()
      } else {
        expect(await session.getRedboxSource()).toMatchSnapshot()
      }

      await session.patch(
        'index.js',
        `
        import { useCallback, useState } from 'react'

        export default function Index() {
          const [count, setCount] = useState(0)
          const increment = useCallback(() => setCount(c => c + 1), [setCount])
          return (
            <main>
              <p>Count: {count}</p>
              <button onClick={increment}>Increment</button>
            </main>
          )
        }
      `
      )

      expect(await session.hasRedbox(false)).toBe(false)

      expect(
        await session.evaluate(() => document.querySelector('p').textContent)
      ).toBe('Count: 1')
      await session.evaluate(() => document.querySelector('button').click())
      expect(
        await session.evaluate(() => document.querySelector('p').textContent)
      ).toBe('Count: 2')

      expect(await session.hasRedbox(false)).toBe(false)

      await cleanup()
    })

    test('logbox: can recover from a component error', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.write(
        'child.js',
        `
        export default function Child() {
          return <p>Hello</p>;
        }
      `
      )

      await session.patch(
        'index.js',
        `
        import Child from './child'

        export default function Index() {
          return (
            <main>
              <Child />
            </main>
          )
        }
      `
      )

      expect(
        await session.evaluate(() => document.querySelector('p').textContent)
      ).toBe('Hello')

      await session.patch(
        'child.js',
        `
        // hello
        export default function Child() {
          throw new Error('oops')
        }
      `
      )

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchSnapshot()

      const didNotReload = await session.patch(
        'child.js',
        `
        export default function Child() {
          return <p>Hello</p>;
        }
      `
      )

      expect(didNotReload).toBe(true)
      expect(await session.hasRedbox(false)).toBe(false)
      expect(
        await session.evaluate(() => document.querySelector('p').textContent)
      ).toBe('Hello')

      await cleanup()
    })

    // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137262
    test('render error not shown right after syntax error', async () => {
      const { session, cleanup } = await sandbox(next)

      // Starting here:
      await session.patch(
        'index.js',
        `
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

      // Break it with a syntax error:
      await session.patch(
        'index.js',
        `
        import * as React from 'react';

        class ClassDefault extends React.Component {
          render()
            return <h1>Default Export</h1>;
          }
        }

        export default ClassDefault;
      `
      )
      expect(await session.hasRedbox(true)).toBe(true)

      // Now change the code to introduce a runtime error without fixing the syntax error:
      await session.patch(
        'index.js',
        `
        import * as React from 'react';

        class ClassDefault extends React.Component {
          render()
            throw new Error('nooo');
            return <h1>Default Export</h1>;
          }
        }

        export default ClassDefault;
      `
      )
      expect(await session.hasRedbox(true)).toBe(true)

      // Now fix the syntax error:
      await session.patch(
        'index.js',
        `
        import * as React from 'react';

        class ClassDefault extends React.Component {
          render() {
            throw new Error('nooo');
            return <h1>Default Export</h1>;
          }
        }

        export default ClassDefault;
      `
      )
      expect(await session.hasRedbox(true)).toBe(true)
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
        `
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
        `
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
      expect(await session.getRedboxSource()).toMatchSnapshot()

      await cleanup()
    })

    // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554144016
    test('stuck error', async () => {
      const { session, cleanup } = await sandbox(next)

      // We start here.
      await session.patch(
        'index.js',
        `
        import * as React from 'react';

        function FunctionDefault() {
          return <h1>Default Export Function</h1>;
        }

        export default FunctionDefault;
      `
      )

      // We add a new file. Let's call it Foo.js.
      await session.write(
        'Foo.js',
        `
        // intentionally skips export
        export default function Foo() {
          return React.createElement('h1', null, 'Foo');
        }
      `
      )

      // We edit our first file to use it.
      await session.patch(
        'index.js',
        `
        import * as React from 'react';
        import Foo from './Foo';
        function FunctionDefault() {
          return <Foo />;
        }
        export default FunctionDefault;
      `
      )

      // We get an error because Foo didn't import React. Fair.
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchSnapshot()

      // Let's add that to Foo.
      await session.patch(
        'Foo.js',
        `
        import * as React from 'react';
        export default function Foo() {
          return React.createElement('h1', null, 'Foo');
        }
      `
      )

      // Expected: this fixes the problem
      expect(await session.hasRedbox(false)).toBe(false)

      await cleanup()
    })

    // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554150098
    test('syntax > runtime error', async () => {
      const { session, cleanup } = await sandbox(next)

      // Start here.
      await session.patch(
        'index.js',
        `
        import * as React from 'react';

        export default function FunctionNamed() {
          return <div />
        }
      `
      )
      // TODO: this acts weird without above step
      await session.patch(
        'index.js',
        `
        import * as React from 'react';
        let i = 0
        setInterval(() => {
          i++
          throw Error('no ' + i)
        }, 1000)
        export default function FunctionNamed() {
          return <div />
        }
      `
      )

      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect(await session.hasRedbox(true)).toBe(true)
      if (process.platform === 'win32') {
        expect(await session.getRedboxSource()).toMatchSnapshot()
      } else {
        expect(await session.getRedboxSource()).toMatchSnapshot()
      }

      // Make a syntax error.
      await session.patch(
        'index.js',
        `
        import * as React from 'react';
        let i = 0
        setInterval(() => {
          i++
          throw Error('no ' + i)
        }, 1000)
        export default function FunctionNamed() {`
      )

      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchSnapshot()

      // Test that runtime error does not take over:
      await new Promise((resolve) => setTimeout(resolve, 2000))
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxSource()).toMatchSnapshot()

      await cleanup()
    })

    // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554152127
    test('boundaries', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.write(
        'FunctionDefault.js',
        `
        export default function FunctionDefault() {
          return <h2>hello</h2>
        }
      `
      )
      await session.patch(
        'index.js',
        `
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
        `
        export default function FunctionNamed() {
          return <div>{{}}</div>
        }`
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
        `
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
        `
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
      expect(source).toMatchSnapshot()

      await cleanup()
    })

    // Module trace is only available with webpack 5
    test('conversion to class component (1)', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.write(
        'Child.js',
        `
        export default function ClickCount() {
          return <p>hello</p>
        }
      `
      )

      await session.patch(
        'index.js',
        `
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
        `
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
        `
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
        `
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
      expect(source).toMatch('./index.module.css:1:1')
      expect(source).toMatch('Syntax error: ')
      expect(source).toMatch('Unclosed block')
      expect(source).toMatch('> 1 | .button {')
      expect(source).toMatch('    | ^')

      // Not local error
      await session.patch('index.module.css', `button {}`)
      expect(await session.hasRedbox(true)).toBe(true)
      const source2 = await session.getRedboxSource()
      expect(source2).toMatchSnapshot()

      await cleanup()
    })

    test('logbox: anchors links in error messages', async () => {
      const { session, cleanup } = await sandbox(next)

      await session.patch(
        'index.js',
        `
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
        `
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
        `
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
        `
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
        `
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

      await session.patch(
        'index.js',
        `
        export default () => {
          throw {'a': 1, 'b': 'x'};
          return (
            <div>hello</div>
          )
        }
      `
      )

      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Error: {\\"a\\":1,\\"b\\":\\"x\\"}"`
      )

      // fix previous error
      await session.patch(
        'index.js',
        `
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
        `
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
      expect(await session.getRedboxDescription()).toContain(
        `Error: class Hello {`
      )

      // fix previous error
      await session.patch(
        'index.js',
        `
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
        `
        export default () => {
          throw "string error"
          return (
            <div>hello</div>
          )
        }
      `
      )
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
        `"Error: string error"`
      )

      // fix previous error
      await session.patch(
        'index.js',
        `
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
        `
        export default () => {
          throw null
          return (
            <div>hello</div>
          )
        }
      `
      )
      expect(await session.hasRedbox(true)).toBe(true)
      expect(await session.getRedboxDescription()).toContain(
        `Error: A null error was thrown`
      )

      await cleanup()
    })
  })
}
