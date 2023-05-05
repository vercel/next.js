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
      expect(await session.getRedboxSource()).toInclude(
        'export default () => <div/'
      )

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
      expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
        "index.js (8:18) @ eval

           6 | const increment = useCallback(() => {
           7 |   setCount(c => c + 1)
        >  8 |   throw new Error('oops')
             |        ^
           9 | }, [setCount])
          10 | return (
          11 |   <main>"
      `)

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
      expect(await session.getRedboxSource()).toInclude(
        'export default function Child()'
      )

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

      await check(async () => {
        const source = await session.getRedboxSource()
        return source?.includes('render() {') ? 'success' : source
      }, 'success')

      expect(await session.getRedboxSource()).toInclude(
        "throw new Error('nooo');"
      )

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
      expect(await session.getRedboxSource()).toInclude(
        "return React.createElement('h1', null, 'Foo');"
      )

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
  })
}
