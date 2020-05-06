/* global jasmine */
/* eslint-env jest */
import { sandbox } from './helpers'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

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
  expect(await session.getRedboxSource()).toMatch('SyntaxError')

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
