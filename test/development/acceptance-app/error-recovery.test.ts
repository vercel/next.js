/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { check, describeVariants as describe } from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

describe.each(['default', 'turbo'])('Error recovery app %s', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    dependencies: {
      react: 'latest',
      'react-dom': 'latest',
    },
    skipStart: true,
  })

  test('can recover from a syntax error without losing state', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      outdent`
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

    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      'export default () => <div/'
    )

    await session.patch(
      'index.js',
      outdent`
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

    expect(await session.hasRedbox()).toBe(false)

    await check(
      () => session.evaluate(() => document.querySelector('p').textContent),
      /Count: 1/
    )

    await cleanup()
  })

  test.each([['client'], ['server']])(
    '%s component can recover from syntax error',
    async (type: string) => {
      const { session, browser, cleanup } = await sandbox(
        next,
        undefined,
        '/' + type
      )

      // Add syntax error
      await session.patch(
        `app/${type}/page.js`,
        outdent`
          export default function Page() {
            return <p>Hello world</p>
        `
      )
      expect(await session.hasRedbox()).toBe(true)

      // Fix syntax error
      await session.patch(
        `app/${type}/page.js`,
        outdent`
          export default function Page() {
            return <p>Hello world 2</p>
          }
        `
      )

      await check(() => browser.elementByCss('p').text(), 'Hello world 2')
      await cleanup()
    }
  )

  test('can recover from a event handler error', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'index.js',
      outdent`
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

    await session.waitForAndOpenRuntimeError()

    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "index.js (7:11) @ eval

         5 |   const increment = useCallback(() => {
         6 |     setCount(c => c + 1)
      >  7 |     throw new Error('oops')
           |           ^
         8 |   }, [setCount])
         9 |   return (
        10 |     <main>"
    `)

    await session.patch(
      'index.js',
      outdent`
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

    expect(await session.hasRedbox()).toBe(false)
    expect(await session.hasErrorToast()).toBe(false)

    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Count: 1')
    await session.evaluate(() => document.querySelector('button').click())
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Count: 2')

    expect(await session.hasRedbox()).toBe(false)
    expect(await session.hasErrorToast()).toBe(false)

    await cleanup()
  })

  test.each([['client'], ['server']])(
    '%s component can recover from a component error',
    async (type: string) => {
      const { session, cleanup, browser } = await sandbox(
        next,
        undefined,
        '/' + type
      )

      await session.write(
        'child.js',
        outdent`
          export default function Child() {
            return <p>Hello</p>;
          }
        `
      )

      await session.patch(
        'index.js',
        outdent`
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

      expect(await browser.elementByCss('p').text()).toBe('Hello')

      await session.patch(
        'child.js',
        outdent`
          // hello
          export default function Child() {
            throw new Error('oops')
          }
        `
      )

      expect(await session.hasRedbox()).toBe(true)
      expect(await session.getRedboxSource()).toInclude(
        'export default function Child()'
      )

      // TODO-APP: re-enable when error recovery doesn't reload the page.
      /* const didNotReload = */ await session.patch(
        'child.js',
        outdent`
          export default function Child() {
            return <p>Hello</p>;
          }
        `
      )

      // TODO-APP: re-enable when error recovery doesn't reload the page.
      // expect(didNotReload).toBe(true)
      expect(await session.hasRedbox()).toBe(false)
      expect(
        await session.evaluate(() => document.querySelector('p').textContent)
      ).toBe('Hello')

      await cleanup()
    }
  )

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554150098
  test('syntax > runtime error', async () => {
    const { session, cleanup } = await sandbox(next)

    // Start here.
    await session.patch(
      'index.js',
      outdent`
        import * as React from 'react';

        export default function FunctionNamed() {
          return <div />
        }
      `
    )
    // TODO: this acts weird without above step
    await session.patch(
      'index.js',
      outdent`
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
    await session.waitForAndOpenRuntimeError()
    expect(await session.getRedboxSource()).not.toInclude(
      "Expected '}', got '<eof>'"
    )

    // Make a syntax error.
    await session.patch(
      'index.js',
      outdent`
        import * as React from 'react';
        let i = 0
        setInterval(() => {
          i++
          throw Error('no ' + i)
        }, 1000)
        export default function FunctionNamed() {
      `
    )

    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      "Expected '}', got '<eof>'"
    )

    // Test that runtime error does not take over:
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      "Expected '}', got '<eof>'"
    )

    await cleanup()
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554144016
  test('stuck error', async () => {
    const { session, cleanup } = await sandbox(next)

    // We start here.
    await session.patch(
      'index.js',
      outdent`
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
      outdent`
        // intentionally skips export
        export default function Foo() {
          return React.createElement('h1', null, 'Foo');
        }
      `
    )

    // We edit our first file to use it.
    await session.patch(
      'index.js',
      outdent`
        import * as React from 'react';
        import Foo from './Foo';
        function FunctionDefault() {
          return <Foo />;
        }
        export default FunctionDefault;
      `
    )

    // We get an error because Foo didn't import React. Fair.
    expect(await session.hasRedbox()).toBe(true)
    expect(await session.getRedboxSource()).toInclude(
      "return React.createElement('h1', null, 'Foo');"
    )

    // Let's add that to Foo.
    await session.patch(
      'Foo.js',
      outdent`
        import * as React from 'react';
        export default function Foo() {
          return React.createElement('h1', null, 'Foo');
        }
      `
    )

    // Expected: this fixes the problem
    expect(await session.hasRedbox()).toBe(false)

    await cleanup()
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137262
  test('render error not shown right after syntax error', async () => {
    const { session, cleanup } = await sandbox(next)

    // Starting here:
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

    // Break it with a syntax error:
    await session.patch(
      'index.js',
      outdent`
        import * as React from 'react';

        class ClassDefault extends React.Component {
          render()
            return <h1>Default Export</h1>;
          }
        }

        export default ClassDefault;
      `
    )
    expect(await session.hasRedbox()).toBe(true)

    // Now change the code to introduce a runtime error without fixing the syntax error:
    await session.patch(
      'index.js',
      outdent`
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
    expect(await session.hasRedbox()).toBe(true)

    // Now fix the syntax error:
    await session.patch(
      'index.js',
      outdent`
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
    expect(await session.hasRedbox()).toBe(true)

    await check(async () => {
      const source = await session.getRedboxSource()
      return source?.includes('render() {') ? 'success' : source
    }, 'success')

    expect(await session.getRedboxSource()).toInclude(
      "throw new Error('nooo');"
    )

    await cleanup()
  })

  test('displays build error on initial page load', async () => {
    const { session, cleanup } = await sandbox(
      next,
      new Map([['app/page.js', '{{{']])
    )

    expect(await session.hasRedbox()).toBe(true)
    await check(() => session.getRedboxSource(true), /Failed to compile/)

    await cleanup()
  })
})
