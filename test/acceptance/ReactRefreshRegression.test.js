/* eslint-env jest */
import { sandbox } from './helpers'

jest.setTimeout(1000 * 60 * 5)

// https://github.com/vercel/next.js/issues/12422
test('styled-components hydration mismatch', async () => {
  const files = new Map()
  files.set(
    'pages/_document.js',
    `
      import Document from 'next/document'
      import { ServerStyleSheet } from 'styled-components'

      export default class MyDocument extends Document {
        static async getInitialProps(ctx) {
          const sheet = new ServerStyleSheet()
          const originalRenderPage = ctx.renderPage

          try {
            ctx.renderPage = () =>
              originalRenderPage({
                enhanceApp: App => props => sheet.collectStyles(<App {...props} />),
              })

            const initialProps = await Document.getInitialProps(ctx)
            return {
              ...initialProps,
              styles: (
                <>
                  {initialProps.styles}
                  {sheet.getStyleElement()}
                </>
              ),
            }
          } finally {
            sheet.seal()
          }
        }
      }
    `
  )

  const [session, cleanup] = await sandbox(undefined, files)

  // We start here.
  const didSsr = !(await session.patch(
    'index.js',
    `
      import React from 'react'
      import styled from 'styled-components'

      const Title = styled.h1\`
        color: red;
        font-size: 50px;
      \`

      export default () => <Title>My page</Title>
    `
  ))

  // Verify loaded from server:
  expect(didSsr).toBe(true)

  // Verify no hydration mismatch:
  expect(await session.hasRedbox()).toBe(false)

  await cleanup()
})

// https://github.com/vercel/next.js/issues/13978
test('can fast refresh a page with getStaticProps', async () => {
  const [session, cleanup] = await sandbox()

  await session.patch(
    'pages/index.js',
    `
      import { useCallback, useState } from 'react'

      export function getStaticProps() {
        return { props: { } }
      }

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

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('0')
  await session.evaluate(() => document.querySelector('button').click())
  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('1')

  await session.patch(
    'pages/index.js',
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

// https://github.com/vercel/next.js/issues/13978
test('can fast refresh a page with getServerSideProps', async () => {
  const [session, cleanup] = await sandbox()

  await session.patch(
    'pages/index.js',
    `
      import { useCallback, useState } from 'react'

      export function getServerSideProps() {
        return { props: { } }
      }

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

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('0')
  await session.evaluate(() => document.querySelector('button').click())
  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('1')

  await session.patch(
    'pages/index.js',
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

// https://github.com/vercel/next.js/issues/13978
test('can fast refresh a page with config', async () => {
  const [session, cleanup] = await sandbox()

  await session.patch(
    'pages/index.js',
    `
      import { useCallback, useState } from 'react'

      export const config = {}

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

  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('0')
  await session.evaluate(() => document.querySelector('button').click())
  expect(
    await session.evaluate(() => document.querySelector('p').textContent)
  ).toBe('1')

  await session.patch(
    'pages/index.js',
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

// https://github.com/vercel/next.js/issues/11504
test('shows an overlay for a server-side error', async () => {
  const [session, cleanup] = await sandbox()

  await session.patch(
    'pages/index.js',
    `export default function () { throw new Error('pre boom'); }`
  )

  const didNotReload = await session.patch(
    'pages/index.js',
    `export default function () { throw new Error('boom'); }`
  )
  expect(didNotReload).toBe(false)

  expect(await session.hasRedbox(true)).toBe(true)

  const source = await session.getRedboxSource()
  expect(source.split(/\r?\n/g).slice(2).join('\n')).toMatchInlineSnapshot(`
    "> 1 | export default function () { throw new Error('boom'); }
        |                                   ^"
  `)

  await cleanup()
})

// https://github.com/vercel/next.js/issues/13574
test('custom loader (mdx) should have Fast Refresh enabled', async () => {
  const files = new Map()
  files.set(
    'next.config.js',
    `
      const withMDX = require("@next/mdx")({
        extension: /\\.mdx?$/,
      });
      module.exports = withMDX({
        pageExtensions: ["js", "mdx"],
      });
    `
  )
  files.set('pages/index.mdx', `Hello World!`)

  const [session, cleanup] = await sandbox(undefined, files, false)
  expect(
    await session.evaluate(() => document.querySelector('#__next').textContent)
  ).toBe('Hello World!')

  let didNotReload = await session.patch('pages/index.mdx', `Hello Foo!`)
  expect(didNotReload).toBe(true)
  expect(await session.hasRedbox()).toBe(false)
  expect(
    await session.evaluate(() => document.querySelector('#__next').textContent)
  ).toBe('Hello Foo!')

  didNotReload = await session.patch('pages/index.mdx', `Hello Bar!`)
  expect(didNotReload).toBe(true)
  expect(await session.hasRedbox()).toBe(false)
  expect(
    await session.evaluate(() => document.querySelector('#__next').textContent)
  ).toBe('Hello Bar!')

  await cleanup()
})
