/* eslint-env jest */
import { sandbox } from './helpers'

jest.setTimeout(1000 * 60 * 5)

test('logbox: can recover from a syntax error without losing state', async () => {
  const [session, cleanup] = await sandbox()

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
  expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
    "./index.js:1:26
    Syntax error: Unexpected token, expected \\"jsxTagEnd\\"

    > 1 | export default () => <div/
        |                           ^"
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

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Count: 1')

  expect(await session.hasRedbox()).toBe(false)

  await cleanup()
})

test('logbox: can recover from a event handler error', async () => {
  const [session, cleanup] = await sandbox()

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
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "index.js (8:16) @ <unknown>

         6 | const increment = useCallback(() => {
         7 |   setCount(c => c + 1)
      >  8 |   throw new Error('oops')
           |        ^
         9 | }, [setCount])
        10 | return (
        11 |   <main>"
    `)
  } else {
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "index.js (8:16) @ eval

         6 | const increment = useCallback(() => {
         7 |   setCount(c => c + 1)
      >  8 |   throw new Error('oops')
           |        ^
         9 | }, [setCount])
        10 | return (
        11 |   <main>"
    `)
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

  expect(await session.hasRedbox()).toBe(false)

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Count: 1')
  await session.evaluate(() => document.querySelector('button').click())
  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Count: 2')

  expect(await session.hasRedbox()).toBe(false)

  await cleanup()
})

test('logbox: can recover from a component error', async () => {
  const [session, cleanup] = await sandbox()

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
  expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
    "child.js (4:14) @ Child

      2 |   // hello
      3 |   export default function Child() {
    > 4 |     throw new Error('oops')
        |          ^
      5 |   }
      6 | "
  `)

  const didNotReload = await session.patch(
    'child.js',
    `
      export default function Child() {
        return <p>Hello</p>;
      }
    `
  )

  expect(didNotReload).toBe(true)
  expect(await session.hasRedbox()).toBe(false)
  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Hello')

  await cleanup()
})

// https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137262
test('render error not shown right after syntax error', async () => {
  const [session, cleanup] = await sandbox()

  // Starting here:
  await session.patch(
    'index.js',
    `
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
  expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
    "index.js (6:16) @ ClassDefault.render

      4 | class ClassDefault extends React.Component {
      5 |   render() {
    > 6 |     throw new Error('nooo');
        |          ^
      7 |     return <h1>Default Export</h1>;
      8 |   }
      9 | }"
  `)

  await cleanup()
})

// https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137807
test('module init error not shown', async () => {
  // Start here:
  const [session, cleanup] = await sandbox()

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
  if (process.platform === 'win32') {
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "index.js (4:12) @ Module../index.js

        2 | // top offset for snapshot
        3 | import * as React from 'react';
      > 4 | throw new Error('no')
          |      ^
        5 | class ClassDefault extends React.Component {
        6 |   render() {
        7 |     return <h1>Default Export</h1>;"
    `)
  } else {
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "index.js (4:12) @ eval

        2 | // top offset for snapshot
        3 | import * as React from 'react';
      > 4 | throw new Error('no')
          |      ^
        5 | class ClassDefault extends React.Component {
        6 |   render() {
        7 |     return <h1>Default Export</h1>;"
    `)
  }

  await cleanup()
})

// https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554144016
test('stuck error', async () => {
  const [session, cleanup] = await sandbox()

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
  expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
    "Foo.js (4:8) @ Foo

      2 |   // intentionally skips export
      3 |   export default function Foo() {
    > 4 |     return React.createElement('h1', null, 'Foo');
        |    ^
      5 |   }
      6 | "
  `)

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
  expect(await session.hasRedbox()).toBe(false)

  await cleanup()
})

// https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554150098
test('syntax > runtime error', async () => {
  const [session, cleanup] = await sandbox()

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
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "index.js (6:14) @ <unknown>

        4 | setInterval(() => {
        5 |   i++
      > 6 |   throw Error('no ' + i)
          |        ^
        7 | }, 1000)
        8 | export default function FunctionNamed() {
        9 |   return <div />"
    `)
  } else {
    expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
      "index.js (6:14) @ eval

        4 | setInterval(() => {
        5 |   i++
      > 6 |   throw Error('no ' + i)
          |        ^
        7 | }, 1000)
        8 | export default function FunctionNamed() {
        9 |   return <div />"
    `)
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
  expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
    "./index.js:8:47
    Syntax error: Unexpected token

      6 |         throw Error('no ' + i)
      7 |       }, 1000)
    > 8 |       export default function FunctionNamed() {
        |                                                ^"
  `)

  // Test that runtime error does not take over:
  await new Promise((resolve) => setTimeout(resolve, 2000))
  expect(await session.hasRedbox(true)).toBe(true)
  expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
    "./index.js:8:47
    Syntax error: Unexpected token

      6 |         throw Error('no ' + i)
      7 |       }, 1000)
    > 8 |       export default function FunctionNamed() {
        |                                                ^"
  `)

  await cleanup()
})

// https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554152127
test('boundaries', async () => {
  const [session, cleanup] = await sandbox()

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
  expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
    "FunctionDefault.js (1:50) @ FunctionDefault

    > 1 | export default function FunctionDefault() { throw new Error('no'); }
        |                                                  ^"
  `)
  expect(
    await session.evaluate(() => document.querySelector('h2').textContent)
  ).toBe('error')

  await cleanup()
})

test('unterminated JSX', async () => {
  const [session, cleanup] = await sandbox()

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

  expect(await session.hasRedbox()).toBe(false)

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
  expect(source).toMatchInlineSnapshot(`
    "./index.js:5:22
    Syntax error: Unterminated JSX contents

      3 |         return (
      4 |           <div>
    > 5 |             <p>lol</p>
        |                       ^
      6 |           div
      7 |         )
      8 |       }"
  `)

  await cleanup()
})

test('conversion to class component (1)', async () => {
  const [session, cleanup] = await sandbox()

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

  expect(await session.hasRedbox()).toBe(false)
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
  expect(await session.getRedboxSource()).toMatchInlineSnapshot(`
    "Child.js (5:16) @ ClickCount.render

      3 |   export default class ClickCount extends Component {
      4 |     render() {
    > 5 |       throw new Error()
        |            ^
      6 |     }
      7 |   }
      8 | "
  `)

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

  expect(await session.hasRedbox()).toBe(false)
  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('hello new')

  await cleanup()
})

test('css syntax errors', async () => {
  const [session, cleanup] = await sandbox()

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

  expect(await session.hasRedbox()).toBe(false)

  // Syntax error
  await session.patch('index.module.css', `.button {`)
  expect(await session.hasRedbox(true)).toBe(true)
  const source = await session.getRedboxSource()
  expect(source).toMatchInlineSnapshot(`
    "./index.module.css:1:1
    Syntax error: Unclosed block

    > 1 | .button {
        | ^"
  `)

  // Not local error
  await session.patch('index.module.css', `button {}`)
  expect(await session.hasRedbox(true)).toBe(true)
  const source2 = await session.getRedboxSource()
  expect(source2).toMatchInlineSnapshot(`
    "./index.module.css:1:1
    Syntax error: Selector \\"button\\" is not pure (pure selectors must contain at least one local class or id)

    > 1 | button {}
        | ^"
  `)

  await cleanup()
})

test('scss syntax errors', async () => {
  const [session, cleanup] = await sandbox()

  await session.write('index.module.scss', `.button { font-size: 5px; }`)
  await session.patch(
    'index.js',
    `
      import './index.module.scss';
      export default () => {
        return (
          <div>
            <p>lol</p>
          </div>
        )
      }
    `
  )

  expect(await session.hasRedbox()).toBe(false)

  // Syntax error
  await session.patch('index.module.scss', `.button { font-size: :5px; }`)
  expect(await session.hasRedbox(true)).toBe(true)
  const source = await session.getRedboxSource()
  expect(source).toMatchInlineSnapshot(`
    "./index.module.scss:1:20
    Syntax error: Invalid CSS after \\"...on { font-size:\\": expected expression (e.g. 1px, bold), was \\":5px; }\\"

    > 1 | .button { font-size: :5px; }
        |                    ^"
  `)

  // Not local error
  await session.patch('index.module.scss', `button { font-size: 5px; }`)
  expect(await session.hasRedbox(true)).toBe(true)
  const source2 = await session.getRedboxSource()
  expect(source2).toMatchInlineSnapshot(`
    "./index.module.scss:1:1
    Syntax error: Selector \\"button\\" is not pure (pure selectors must contain at least one local class or id)

    > 1 | button { font-size: 5px; }
        |                          ^"
  `)

  await cleanup()
})

test('logbox: anchors links in error messages', async () => {
  const [session, cleanup] = await sandbox()

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

  expect(await session.hasRedbox()).toBe(false)
  await session.evaluate(() => document.querySelector('button').click())
  expect(await session.hasRedbox(true)).toBe(true)

  const header = await session.getRedboxDescription()
  expect(header).toMatchInlineSnapshot(`"Error: end http://nextjs.org"`)
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
        document
          .querySelector('body > nextjs-portal')
          .shadowRoot.querySelector(
            '#nextjs__container_errors_desc a:nth-of-type(1)'
          ).href
    )
  ).toMatchInlineSnapshot(`"http://nextjs.org/"`)

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

  expect(await session.hasRedbox()).toBe(false)
  await session.evaluate(() => document.querySelector('button').click())
  expect(await session.hasRedbox(true)).toBe(true)

  const header2 = await session.getRedboxDescription()
  expect(header2).toMatchInlineSnapshot(`"Error: http://nextjs.org start"`)
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
        document
          .querySelector('body > nextjs-portal')
          .shadowRoot.querySelector(
            '#nextjs__container_errors_desc a:nth-of-type(1)'
          ).href
    )
  ).toMatchInlineSnapshot(`"http://nextjs.org/"`)

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

  expect(await session.hasRedbox()).toBe(false)
  await session.evaluate(() => document.querySelector('button').click())
  expect(await session.hasRedbox(true)).toBe(true)

  const header3 = await session.getRedboxDescription()
  expect(header3).toMatchInlineSnapshot(`"Error: middle http://nextjs.org end"`)
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
        document
          .querySelector('body > nextjs-portal')
          .shadowRoot.querySelector(
            '#nextjs__container_errors_desc a:nth-of-type(1)'
          ).href
    )
  ).toMatchInlineSnapshot(`"http://nextjs.org/"`)

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

  expect(await session.hasRedbox()).toBe(false)
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
        document
          .querySelector('body > nextjs-portal')
          .shadowRoot.querySelector(
            '#nextjs__container_errors_desc a:nth-of-type(1)'
          ).href
    )
  ).toMatchInlineSnapshot(`"http://nextjs.org/"`)
  expect(
    await session.evaluate(
      () =>
        document
          .querySelector('body > nextjs-portal')
          .shadowRoot.querySelector(
            '#nextjs__container_errors_desc a:nth-of-type(2)'
          ).href
    )
  ).toMatchInlineSnapshot(`"http://example.com/"`)

  await cleanup()
})
