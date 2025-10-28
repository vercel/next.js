/* eslint-env jest */
import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { outdent } from 'outdent'
import path from 'path'

describe('ReactRefreshRegression', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
    dependencies: {
      'styled-components': '6.1.16',
      '@next/mdx': 'canary',
      '@mdx-js/loader': '2.2.1',
      '@mdx-js/react': '2.2.1',
    },
  })

  // https://github.com/vercel/next.js/issues/12422
  test('styled-components hydration mismatch', async () => {
    const files = new Map([
      [
        'pages/_document.js',
        outdent`
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
        `,
      ],
    ])

    await using sandbox = await createSandbox(next, files)
    const { session } = sandbox

    // We start here.
    await session.patch(
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
    )

    // Verify no hydration mismatch:
    await session.assertNoRedbox()
  })

  // https://github.com/vercel/next.js/issues/13978
  test('can fast refresh a page with getStaticProps', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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
  })

  // https://github.com/vercel/next.js/issues/13978
  test('can fast refresh a page with getServerSideProps', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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
  })

  // https://github.com/vercel/next.js/issues/13978
  test('can fast refresh a page with config', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

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

    await check(
      () => session.evaluate(() => document.querySelector('p').textContent),
      '0'
    )

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
  })

  // https://github.com/vercel/next.js/issues/11504
  test('shows an overlay for a server-side error', async () => {
    await using sandbox = await createSandbox(next)
    const { browser, session } = sandbox

    await session.patch(
      'pages/index.js',
      `export default function () { throw new Error('pre boom'); }`
    )

    const didNotReload = await session.patch(
      'pages/index.js',
      `export default function () { throw new Error('boom'); }`
    )
    expect(didNotReload).toBe(false)

    if (isTurbopack) {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "boom",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "pages/index.js (1:36) @ {default export}
       > 1 | export default function () { throw new Error('boom'); }
           |                                    ^",
         "stack": [
           "{default export} pages/index.js (1:36)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "boom",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "pages/index.js (1:36) @ default
       > 1 | export default function () { throw new Error('boom'); }
           |                                    ^",
         "stack": [
           "default pages/index.js (1:36)",
         ],
       }
      `)
    }
  })

  // https://github.com/vercel/next.js/issues/13574
  test('custom loader mdx should have Fast Refresh enabled', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'next.config.js',
          outdent`
              const withMDX = require("@next/mdx")({
                extension: /\\.mdx?$/,
              });
              module.exports = withMDX({
                pageExtensions: ["js", "mdx"],
              });
            `,
        ],
        ['pages/mdx.mdx', `Hello World!`],
      ]),
      '/mdx'
    )
    const { session } = sandbox
    expect(
      await session.evaluate(
        () => document.querySelector('#__next').textContent
      )
    ).toBe('Hello World!')

    let didNotReload = await session.patch('pages/mdx.mdx', `Hello Foo!`)
    expect(didNotReload).toBe(true)
    await session.assertNoRedbox()
    expect(
      await session.evaluate(
        () => document.querySelector('#__next').textContent
      )
    ).toBe('Hello Foo!')

    didNotReload = await session.patch('pages/mdx.mdx', `Hello Bar!`)
    expect(didNotReload).toBe(true)
    await session.assertNoRedbox()
    expect(
      await session.evaluate(
        () => document.querySelector('#__next').textContent
      )
    ).toBe('Hello Bar!')
  })
})
