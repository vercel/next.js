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

  await cleanup()
})

test('cyclic dependencies', async () => {
  const [session, cleanup] = await sandbox()

  await session.write(
    'NudgeOverview.js',
    `
      import * as React from 'react';

      import { foo } from './routes';

      const NudgeOverview = () => {
        return <span />;
        foo;
      };

      export default NudgeOverview;
    `
  )

  await session.write(
    'SurveyOverview.js',
    `
      const SurveyOverview = () => {
        return 100;
      };

      export default SurveyOverview;
    `
  )

  await session.write(
    'Milestones.js',
    `
      import React from 'react';

      import { fragment } from './DashboardPage';

      const Milestones = props => {
        return <span />;
        fragment;
      };

      export default Milestones;
    `
  )

  await session.write(
    'DashboardPage.js',
    `
      import React from 'react';

      import Milestones from './Milestones';
      import SurveyOverview from './SurveyOverview';
      import NudgeOverview from './NudgeOverview';

      export const fragment = {};

      const DashboardPage = () => {
        return (
          <>
            <Milestones />
            <SurveyOverview />
            <NudgeOverview />
          </>
        );
      };

      export default DashboardPage;
    `
  )

  await session.write(
    'routes.js',
    `
      import DashboardPage from './DashboardPage';

      export const foo = {};

      console.warn('DashboardPage at import time:', DashboardPage);
      setTimeout(() => console.warn('DashboardPage after:', DashboardPage), 0);

      export default DashboardPage;
    `
  )

  await session.patch(
    'index.js',
    `
      import * as React from 'react';

      import DashboardPage from './routes';

      const HeroApp = (props) => {
        return <p>Hello. {DashboardPage ? <DashboardPage /> : null}</p>;
      };

      export default HeroApp;
    `
  )

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Hello. 100')

  let didFullRefresh = !(await session.patch(
    'SurveyOverview.js',
    `
      const SurveyOverview = () => {
        return 200;
      };

      export default SurveyOverview;
    `
  ))

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Hello. 200')
  expect(didFullRefresh).toBe(false)

  didFullRefresh = !(await session.patch(
    'index.js',
    `
      import * as React from 'react';

      import DashboardPage from './routes';

      const HeroApp = (props) => {
        return <p>Hello: {DashboardPage ? <DashboardPage /> : null}</p>;
      };

      export default HeroApp;
    `
  ))

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Hello: 200')
  expect(didFullRefresh).toBe(false)

  didFullRefresh = !(await session.patch(
    'SurveyOverview.js',
    `
      const SurveyOverview = () => {
        return 300;
      };

      export default SurveyOverview;
    `
  ))

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('Hello: 300')
  expect(didFullRefresh).toBe(false)

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
