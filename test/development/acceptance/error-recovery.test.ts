/* eslint-env jest */
import { sandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { check, describeVariants as describe } from 'next-test-utils'
import { outdent } from 'outdent'
import path from 'path'

describe.each(['default', 'turbo'])('ReactRefreshLogBox %s', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  test('logbox: can recover from a syntax error without losing state', async () => {
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

    expect(await session.hasRedbox(true)).toBe(true)
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

    expect(await session.hasRedbox(true)).toBe(true)
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "index.js (7:10) @ eval

         5 | const increment = useCallback(() => {
         6 |   setCount(c => c + 1)
      >  7 |   throw new Error('oops')
           |        ^
         8 | }, [setCount])
         9 | return (
        10 |   <main>"
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

    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Hello')

    await session.patch(
      'child.js',
      outdent`
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
      outdent`
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
    expect(await session.hasRedbox(true)).toBe(true)

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
    expect(await session.hasRedbox(true)).toBe(true)

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
    expect(await session.hasRedbox(true)).toBe(true)
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
    expect(await session.hasRedbox(false)).toBe(false)

    await cleanup()
  })

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
    expect(await session.hasRedbox(true)).toBe(true)
    if (process.platform === 'win32') {
      expect(await session.getRedboxSource()).toMatchSnapshot()
    } else {
      expect(await session.getRedboxSource()).toMatchSnapshot()
    }

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
        export default function FunctionNamed() {`
    )

    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(await session.hasRedbox(true)).toBe(true)
    expect(
      next.normalizeTestDirContent(await session.getRedboxSource())
    ).toMatchInlineSnapshot(
      next.normalizeSnapshot(`
        "./index.js
        Error: 
          x Expected '}', got '<eof>'
           ,-[TEST_DIR/index.js:4:1]
         4 |   i++
         5 |   throw Error('no ' + i)
         6 | }, 1000)
         7 | export default function FunctionNamed() {
           :                                         ^
           \`----

        Caused by:
            Syntax Error

        Import trace for requested module:
        ./index.js
        ./pages/index.js"
      `)
    )

    // Test that runtime error does not take over:
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(await session.hasRedbox(true)).toBe(true)
    expect(
      next.normalizeTestDirContent(await session.getRedboxSource())
    ).toMatchInlineSnapshot(
      next.normalizeSnapshot(`
        "./index.js
        Error: 
          x Expected '}', got '<eof>'
           ,-[TEST_DIR/index.js:4:1]
         4 |   i++
         5 |   throw Error('no ' + i)
         6 | }, 1000)
         7 | export default function FunctionNamed() {
           :                                         ^
           \`----

        Caused by:
            Syntax Error

        Import trace for requested module:
        ./index.js
        ./pages/index.js"
      `)
    )

    await cleanup()
  })
})
