/* global jasmine */
/* eslint-env jest */
import { sandbox } from './helpers'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

test('basic: can edit a component without losing state', async () => {
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
  await session.evaluate(() => document.querySelector('button').click())
  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Count: 2')

  await cleanup()
})

test('can recover from a syntax error without losing state', async () => {
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
  expect(await session.getOverlayContent()).toMatch('Failed to compile')

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

  await cleanup()
})

// https://github.com/facebook/metro/blob/b651e535cd0fc5df6c0803b9aa647d664cb9a6c3/packages/metro/src/lib/polyfills/__tests__/require-test.js#L989-L1048
test.only('re-runs accepted modules', async () => {
  const [session, cleanup] = await sandbox()

  await session.patch(
    'index.js',
    `export default function Noop() { return null; };`
  )

  await session.evaluate(() => (window.log = []))
  await session.write(
    './foo.js',
    `window.log.push('init FooV1'); require('./bar');`
  )
  await session.write(
    './bar.js',
    `window.log.push('init BarV1'); export default function Bar() { return null; };`
  )
  await session.patch(
    'index.js',
    `require('./foo'); export default function Noop() { return null; };`
  )

  expect(await session.evaluate(() => window.log)).toEqual([
    'init FooV1',
    'init BarV1',
  ])

  // We only edited Bar, and it accepted.
  // So we expect it to re-run alone.
  await session.evaluate(() => (window.log = []))
  await session.patch(
    './bar.js',
    `window.log.push('init BarV2'); export default function Bar() { return null; };`
  )
  expect(await session.evaluate(() => window.log)).toEqual(['init BarV2'])

  // We only edited Bar, and it accepted.
  // So we expect it to re-run alone.
  await session.evaluate(() => (window.log = []))
  await session.patch(
    './bar.js',
    `window.log.push('init BarV3'); export default function Bar() { return null; };`
  )
  expect(await session.evaluate(() => window.log)).toEqual(['init BarV3'])

  // TODO:
  // expect(Refresh.performReactRefresh).toHaveBeenCalled();
  // expect(Refresh.performFullRefresh).not.toHaveBeenCalled();

  await cleanup()
})
