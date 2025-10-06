/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import path from 'path'
import { outdent } from 'outdent'

describe('Error recovery app', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })
  const isRspack = !!process.env.NEXT_RSPACK

  test('can recover from a syntax error without losing state', async () => {
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

    await browser.elementByCss('button').click()
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
       ./app/page.js",
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
       ./app/page.js",
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

    await session.assertNoRedbox()

    await check(
      () => session.evaluate(() => document.querySelector('p').textContent),
      /Count: 1/
    )
  })

  test('server component can recover from syntax error', async () => {
    const type = 'server'
    await using sandbox = await createSandbox(next, undefined, '/' + type)
    const { browser, session } = sandbox
    // Add syntax error
    await session.patch(
      `app/${type}/page.js`,
      outdent`
          export default function Page() {
            return <p>Hello world</p>
        `
    )
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/server/page.js (2:28)
       Parsing ecmascript source code failed
       > 2 |   return <p>Hello world</p>
           |                            ^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/server/page.js
         × Module build failed:
         ╰─▶   × Error:   x Expected '}', got '<eof>'
               │    ,-[2:1]
               │  1 | export default function Page() {
               │  2 |   return <p>Hello world</p>
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./app/server/page.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Expected '}', got '<eof>'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/server/page.js
       Error:   x Expected '}', got '<eof>'
          ,-[2:1]
        1 | export default function Page() {
        2 |   return <p>Hello world</p>
          \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./app/server/page.js",
         "stack": [],
       }
      `)
    }

    // Fix syntax error
    await session.patch(
      `app/${type}/page.js`,
      outdent`
          export default function Page() {
            return <p>Hello world 2</p>
          }
        `
    )

    await check(
      () => session.evaluate(() => document.querySelector('p').textContent),
      'Hello world 2'
    )
  })

  test('client component can recover from syntax error', async () => {
    const type = 'client'
    await using sandbox = await createSandbox(next, undefined, '/' + type)
    const { browser, session } = sandbox
    // Add syntax error
    await session.patch(
      `app/${type}/page.js`,
      outdent`
          export default function Page() {
            return <p>Hello world</p>
        `
    )

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/client/page.js (2:28)
       Parsing ecmascript source code failed
       > 2 |   return <p>Hello world</p>
           |                            ^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/client/page.js
         × Module build failed:
         ╰─▶   × Error:   x Expected '}', got '<eof>'
               │    ,-[2:1]
               │  1 | export default function Page() {
               │  2 |   return <p>Hello world</p>
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./app/client/page.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Expected '}', got '<eof>'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/client/page.js
       Error:   x Expected '}', got '<eof>'
          ,-[2:1]
        1 | export default function Page() {
        2 |   return <p>Hello world</p>
          \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./app/client/page.js",
         "stack": [],
       }
      `)
    }

    // Fix syntax error
    await session.patch(
      `app/${type}/page.js`,
      outdent`
          export default function Page() {
            return <p>Hello world 2</p>
          }
        `
    )

    await check(
      () => session.evaluate(() => document.querySelector('p').textContent),
      'Hello world 2'
    )
  })

  test('can recover from a event handler error', async () => {
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

    if (isTurbopack) {
      // TODO(veil): Location of Page should be app/page.js
      // TODO(sokra): The location is wrong because of an bug with HMR and source maps.
      // When the code `index.js` changes, this also moves the locations of `app/page.js` in the bundled file.
      // So the SourceMap is updated to reflect that. But the browser still has the old bundled file loaded.
      // So we look up locations from the old bundle in the new source maps, which leads to mismatched locations.
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "oops",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (7:11) @ Index.useCallback[increment]
       >  7 |     throw new Error('oops')
            |           ^",
         "stack": [
           "Index.useCallback[increment] index.js (7:11)",
           "button <anonymous>",
           "Index index.js (12:7)",
           "Page index.js (10:5)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "oops",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (7:11) @ Index.useCallback[increment]
       >  7 |     throw new Error('oops')
            |           ^",
         "stack": [
           "Index.useCallback[increment] index.js (7:11)",
           "button <anonymous>",
           "Index index.js (12:7)",
           "Page app/page.js (4:10)",
         ],
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

    await session.assertNoRedbox()
    expect(await session.hasErrorToast()).toBe(false)

    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Count: 1')
    await browser.elementByCss('button').click()
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Count: 2')

    await session.assertNoRedbox()
    expect(await session.hasErrorToast()).toBe(false)
  })

  test('server component can recover from a component error', async () => {
    const type = 'server'
    await using sandbox = await createSandbox(next, undefined, '/' + type)
    const { session, browser } = sandbox

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

    await expect(browser).toDisplayRedbox(
      `
     {
       "description": "oops",
       "environmentLabel": "Server",
       "label": "<FIXME-excluded-label>",
       "source": "child.js (3:9) @ Child
     > 3 |   throw new Error('oops')
         |         ^",
       "stack": [
         "Child child.js (3:9)",
         "Page app/server/page.js (3:10)",
       ],
     }
    `,

      // FIXME: `label` is flaking between "Runtime Error" and "Recoverable Error"
      { label: false }
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
    await session.assertNoRedbox()
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Hello')
  })

  test('client component can recover from a component error', async () => {
    const type = 'client'
    await using sandbox = await createSandbox(next, undefined, '/' + type)
    const { session, browser } = sandbox

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

    if (isTurbopack) {
      // TODO(veil): Possibly https://linear.app/vercel/issue/NDX-920/
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
           "Index index.js (6:7)",
           "<FIXME-file-protocol>",
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
           "Index index.js (6:7)",
           "Page app/client/page.js (4:10)",
         ],
       }
      `)
    }

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
    await session.assertNoRedbox()
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('Hello')
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
        window.triggerError = () => {
          // TODO(veil): sync thrown errors do not trigger Redbox.
          setTimeout(() => {
            i++
            throw Error('no ' + i)
          }, 0)
        }
        export default function FunctionNamed() {
          return <div />
        }
      `
    )

    await browser.eval('window.triggerError()')
    if (isRspack) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "no 1",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (7:11) @ eval
       >  7 |     throw Error('no ' + i)
            |           ^",
         "stack": [
           "eval index.js (7:11)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "description": "no 1",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "index.js (7:11) @ eval
       >  7 |     throw Error('no ' + i)
            |           ^",
         "stack": [
           "eval index.js (7:11)",
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
        window.triggerError = () => {
          // TODO(veil): sync thrown errors do not trigger Redbox.
          setTimeout(() => {
            i++
            throw Error('no ' + i)
          }, 0)
        }
        export default function FunctionNamed() {
      `
    )

    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (10:42)
       Parsing ecmascript source code failed
       > 10 | export default function FunctionNamed() {
            |                                          ^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
         × Module build failed:
         ╰─▶   × Error:   x Expected '}', got '<eof>'
               │     ,-[10:1]
               │   7 |     throw Error('no ' + i)
               │   8 |   }, 0)
               │   9 | }
               │  10 | export default function FunctionNamed() {
               │     \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./index.js
       ./app/page.js",
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
           ,-[10:1]
        10 | export default function FunctionNamed() {
           \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./index.js
       ./app/page.js",
         "stack": [],
       }
      `)
    }

    // Test that runtime error does not take over:
    await browser.eval('window.triggerError()')
    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js (10:42)
       Parsing ecmascript source code failed
       > 10 | export default function FunctionNamed() {
            |                                          ^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./index.js
         × Module build failed:
         ╰─▶   × Error:   x Expected '}', got '<eof>'
               │     ,-[10:1]
               │   7 |     throw Error('no ' + i)
               │   8 |   }, 0)
               │   9 | }
               │  10 | export default function FunctionNamed() {
               │     \`----
               │
               │
               │ Caused by:
               │     Syntax Error
       Import trace for requested module:
       ./index.js
       ./app/page.js",
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
           ,-[10:1]
        10 | export default function FunctionNamed() {
           \`----
       Caused by:
           Syntax Error
       Import trace for requested module:
       ./index.js
       ./app/page.js",
         "stack": [],
       }
      `)
    }
  })

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554144016
  test('stuck error', async () => {
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

    // We get an error because Foo didn't import React. Fair.
    if (isTurbopack) {
      // TODO(veil): Possibly https://linear.app/vercel/issue/NDX-920/
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
           "FunctionDefault index.js (4:10)",
           "<FIXME-file-protocol>",
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
           "FunctionDefault index.js (4:10)",
           "Page app/page.js (4:10)",
         ],
       }
      `)
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

  // https://github.com/pmmmwh/react-refresh-webpack-plugin/pull/3#issuecomment-554137262
  test('render error not shown right after syntax error', async () => {
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
       ./app/page.js",
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
       ./app/page.js",
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
      await expect(browser).toDisplayRedbox(`
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
       ./app/page.js",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
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
       ./app/page.js",
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
    if (isTurbopack) {
      // TODO(veil): Location of Page should be app/page.js
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
           "Page index.js (10:16)",
         ],
       }
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
           "Page app/page.js (4:10)",
         ],
       }
      `)
    }
  })

  test('displays build error on initial page load', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([['app/page.js', '{{{']])
    )
    const { browser } = sandbox

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Parsing ecmascript source code failed",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js (1:4)
       Parsing ecmascript source code failed
       > 1 | {{{
           |    ^",
         "stack": [],
       }
      `)
    } else if (isRspack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  × Module build failed:",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js
         × Module build failed:
         ╰─▶   × Error:   x Expected '}', got '<eof>'
               │    ,----
               │  1 | {{{
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error",
         "stack": [],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "  x Expected '}', got '<eof>'",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.js
       Error:   x Expected '}', got '<eof>'
          ,----
        1 | {{{
          \`----
       Caused by:
           Syntax Error",
         "stack": [],
       }
      `)
    }
  })
})
