/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { check, retry } from 'next-test-utils'
import { outdent } from 'outdent'
import path from 'path'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18
const isRspack = !!process.env.NEXT_RSPACK

describe('pages/ error recovery', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  test('logbox: can recover from a syntax error without losing state', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (1:27)
       Parsing ecmascript source code failed
       > 1 | export default () => <div/
           |                           ^",
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
         ╰─▶   × Error:   x Expected '>', got '<eof>'
               │    ,----
               │  1 | export default () => <div/
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Expected '>', got '<eof>'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
       Error:   x Expected '>', got '<eof>'
          ,----
        1 | export default () => <div/
          \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    }

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

    await session.assertNoRedbox()
  })

  test('logbox: can recover from a event handler error', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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
    await browser.elementByCss('button').click()
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('1')

    await expect(browser).toDisplayRedbox(`
     {
       "description": "oops",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "index.js (7:11) @ Index.useCallback[increment]
     >  7 |     throw new Error('oops')
          |           ^",
       "stack": [
         "Index.useCallback[increment] index.js (7:11)",
       ],
     }
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

    await session.assertNoRedbox()

    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Count: 1')
    await browser.elementByCss('button').click()
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Count: 2')

    await session.assertNoRedbox()
  })

  it('logbox: can recover from a component error', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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

    if (isReact18 && isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       [
         {
           "description": "oops",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "child.js (3:9) @ Child
       > 3 |   throw new Error('oops')
           |         ^",
           "stack": [
             "Child child.js (3:9)",
           ],
         },
         {
           "description": "oops",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "child.js (3:9) @ Child
       > 3 |   throw new Error('oops')
           |         ^",
           "stack": [
             "Child child.js (3:9)",
           ],
         },
       ]
      `)
    } else if (isReact18 && isRspack) {
      await expect(browser).toDisplayRedbox(`
       [
         {
           "description": "oops",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "child.js (3:9) @ Child
       > 3 |   throw new Error('oops')
           |         ^",
           "stack": [
             "Child child.js (3:9)",
           ],
         },
         {
           "description": "oops",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "child.js (3:9) @ Child
       > 3 |   throw new Error('oops')
           |         ^",
           "stack": [
             "Child child.js (3:9)",
           ],
         },
       ]
      `)
    } else {
      if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "oops",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "child.js (3:9) @ Child
         > 3 |   throw new Error('oops')
             |         ^",
           "stack": [
             "Child child.js (3:9)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "oops",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "child.js (3:9) @ Child
         > 3 |   throw new Error('oops')
             |         ^",
           "stack": [
             "Child child.js (3:9)",
           ],
         }
        `)
      }
    }

    const didNotReload = await session.patch(
      'child.js',
      outdent`
        export default function Child() {
          return <p>Hello</p>;
        }
      `
    )

    expect(didNotReload).toBe(true)
    await session.assertNoRedbox()
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Hello')
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137262
  it('render error not shown right after syntax error', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (5:5)
       Parsing ecmascript source code failed
       > 5 |     return <h1>Default Export</h1>;
           |     ^^^^^^",
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
         ╰─▶   × Error:   x Expected '{', got 'return'
               │    ,-[5:1]
               │  2 |
               │  3 | class ClassDefault extends React.Component {
               │  4 |   render()
               │  5 |     return <h1>Default Export</h1>;
               │    :     ^^^^^^
               │  6 |   }
               │  7 | }
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Expected '{', got 'return'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
       Error:   x Expected '{', got 'return'
          ,-[5:1]
        2 |
        3 | class ClassDefault extends React.Component {
        4 |   render()
        5 |     return <h1>Default Export</h1>;
          :     ^^^^^^
        6 |   }
        7 | }
          \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    }

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

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (5:5)
       Parsing ecmascript source code failed
       > 5 |     throw new Error('nooo');
           |     ^^^^^",
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
         ╰─▶   × Error:   x Expected '{', got 'throw'
               │    ,-[5:1]
               │  2 |
               │  3 | class ClassDefault extends React.Component {
               │  4 |   render()
               │  5 |     throw new Error('nooo');
               │    :     ^^^^^
               │  6 |     return <h1>Default Export</h1>;
               │  7 |   }
               │  8 | }
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    } else {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  x Expected '{', got 'throw'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
       Error:   x Expected '{', got 'throw'
          ,-[5:1]
        2 |
        3 | class ClassDefault extends React.Component {
        4 |   render()
        5 |     throw new Error('nooo');
          :     ^^^^^
        6 |     return <h1>Default Export</h1>;
        7 |   }
        8 | }
          \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    }

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

    // wait for patch to get applied
    await retry(async () => {
      await expect(session.getRedboxSource()).resolves.toInclude('render() {')
    })

    if (isReact18 && isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       [
         {
           "description": "nooo",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (5:11) @ ClassDefault.render
       > 5 |     throw new Error('nooo');
           |           ^",
           "stack": [
             "ClassDefault.render index.js (5:11)",
           ],
         },
         {
           "description": "nooo",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "index.js (5:11) @ ClassDefault.render
       > 5 |     throw new Error('nooo');
           |           ^",
           "stack": [
             "ClassDefault.render index.js (5:11)",
           ],
         },
       ]
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
        {
          "description": "nooo",
          "environmentLabel": null,
          "label": "Runtime Error",
          "source": "index.js (5:11) @ ClassDefault.render
        > 5 |     throw new Error('nooo');
            |           ^",
          "stack": [
            "ClassDefault.render index.js (5:11)",
          ],
        }
      `)
    }
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554144016
  it('stuck error', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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

    if (isReact18 && (isRspack || isTurbopack)) {
      await expect(browser).toDisplayRedbox(`
       [
         {
           "description": "React is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "Foo.js (3:3) @ Foo
       > 3 |   return React.createElement('h1', null, 'Foo');
           |   ^",
           "stack": [
             "Foo Foo.js (3:3)",
           ],
         },
         {
           "description": "React is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "Foo.js (3:3) @ Foo
       > 3 |   return React.createElement('h1', null, 'Foo');
           |   ^",
           "stack": [
             "Foo Foo.js (3:3)",
           ],
         },
       ]
      `)
    } else {
      if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "React is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "Foo.js (3:3) @ Foo
         > 3 |   return React.createElement('h1', null, 'Foo');
             |   ^",
           "stack": [
             "Foo Foo.js (3:3)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "React is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "Foo.js (3:3) @ Foo
         > 3 |   return React.createElement('h1', null, 'Foo');
             |   ^",
           "stack": [
             "Foo Foo.js (3:3)",
           ],
         }
        `)
      }
    }

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
    await session.assertNoRedbox()
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554150098
  test('syntax > runtime error', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

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

    if (isRspack) {
      await expect(browser).toDisplayRedbox(`
            {
              "description": "no 1",
              "environmentLabel": null,
              "label": "Runtime Error",
              "source": "index.js (5:9) @ eval
            > 5 |   throw Error('no ' + i)
                |         ^",
              "stack": [
                "eval index.js (5:9)",
              ],
            }
          `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "no 1",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (5:9) @ eval
       > 5 |   throw Error('no ' + i)
           |         ^",
         "stack": [
           "eval index.js (5:9)",
         ],
       }
      `)
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

    if (isTurbopack) {
      // TODO: Remove this branching once import traces are implemented in Turbopack

      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (7:42)
       Parsing ecmascript source code failed
       > 7 | export default function FunctionNamed() {
           |                                          ^",
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
         ╰─▶   × Error:   x Expected '}', got '<eof>'
               │    ,-[7:1]
               │  4 |   i++
               │  5 |   throw Error('no ' + i)
               │  6 | }, 1000)
               │  7 | export default function FunctionNamed() {
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Expected '}', got '<eof>'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
       Error:   x Expected '}', got '<eof>'
          ,-[7:1]
        4 |   i++
        5 |   throw Error('no ' + i)
        6 | }, 1000)
        7 | export default function FunctionNamed() {
          \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    }

    // Test that runtime error does not take over:
    await new Promise((resolve) => setTimeout(resolve, 2000))

    if (isTurbopack) {
      // TODO: Remove this branching once import traces are implemented in Turbopack
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (7:42)
       Parsing ecmascript source code failed
       > 7 | export default function FunctionNamed() {
           |                                          ^",
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
         ╰─▶   × Error:   x Expected '}', got '<eof>'
               │    ,-[7:1]
               │  4 |   i++
               │  5 |   throw Error('no ' + i)
               │  6 | }, 1000)
               │  7 | export default function FunctionNamed() {
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    } else {
      await expect({ browser, next }).toDisplayRedbox(`
       {
         "description": "  x Expected '}', got '<eof>'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
       Error:   x Expected '}', got '<eof>'
          ,-[7:1]
        4 |   i++
        5 |   throw Error('no ' + i)
        6 | }, 1000)
        7 | export default function FunctionNamed() {
          \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./index.js
       ./pages/index.js",
         "stack": [],
       }
      `)
    }
  })
})
