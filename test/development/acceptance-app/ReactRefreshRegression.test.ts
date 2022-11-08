/* eslint-env jest */
import { sandbox } from './helpers'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import path from 'path'

describe('ReactRefreshRegression app', () => {
  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }

  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
      skipStart: true,
      dependencies: {
        'styled-components': '5.1.0',
        '@next/mdx': 'canary',
        '@mdx-js/loader': '0.18.0',
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  // https://github.com/vercel/next.js/issues/12422
  // TODO-APP: port to app directory
  test.skip('styled-components hydration mismatch', async () => {
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

    const { session, cleanup } = await sandbox(next, files)

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
    expect(await session.hasRedbox()).toBe(false)

    await cleanup()
  })

  // https://github.com/vercel/next.js/issues/13978
  test('can fast refresh a page with static generation', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'app/page.js',
      `'use client'
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

    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('0')
    await session.evaluate(() => document.querySelector('button').click())
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('1')

    await session.patch(
      'app/page.js',
      `'use client'
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
  // TODO-APP: fix case where server component is moved to a client component
  test.skip('can fast refresh a page with dynamic rendering', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'app/page.js',
      `
        export const revalidate = 0

        import Component from '../index'
        export default function Page() {
          return <Component />
        }
      `
    )
    await session.patch(
      'index.js',
      `'use client'
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

    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('0')
    await session.evaluate(() => document.querySelector('button').click())
    expect(
      await session.evaluate(() => document.querySelector('p').textContent)
    ).toBe('1')

    await session.patch(
      'index.js',
      `'use client'
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
  // TODO-APP: fix case where server component is moved to a client component
  test.skip('can fast refresh a page with config', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'app/page.js',
      `
        export const config = {}

        import Component from '../index'
        export default function Page() {
          return <Component />
        }
      `
    )

    await session.patch(
      'index.js',
      `'use client'
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

    await cleanup()
  })

  // https://github.com/vercel/next.js/issues/11504
  // TODO-APP: fix case where error is not resolved to source correctly.
  test.skip('shows an overlay for a server-side error', async () => {
    const { session, cleanup } = await sandbox(next)

    await session.patch(
      'app/page.js',
      `export default function () { throw new Error('pre boom'); }`
    )

    const didNotReload = await session.patch(
      'app/page.js',
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
  test('custom loader mdx should have Fast Refresh enabled', async () => {
    const files = new Map()
    files.set(
      'next.config.js',
      `
        const withMDX = require("@next/mdx")({
          extension: /\\.mdx?$/,
        });
        module.exports = withMDX({
          pageExtensions: ["js", "mdx"],
          experimental: { appDir: true },
        });
      `
    )
    files.set('app/content.mdx', `Hello World!`)
    files.set(
      'app/page.js',
      `'use client'
    import MDX from './content.mdx'
    export default function Page() {
      return <div id="content"><MDX /></div>
    }
    `
    )

    const { session, cleanup } = await sandbox(next, files)
    expect(
      await session.evaluate(
        () => document.querySelector('#content').textContent
      )
    ).toBe('Hello World!')

    let didNotReload = await session.patch('app/content.mdx', `Hello Foo!`)
    expect(didNotReload).toBe(true)
    expect(await session.hasRedbox()).toBe(false)
    expect(
      await session.evaluate(
        () => document.querySelector('#content').textContent
      )
    ).toBe('Hello Foo!')

    didNotReload = await session.patch('app/content.mdx', `Hello Bar!`)
    expect(didNotReload).toBe(true)
    expect(await session.hasRedbox()).toBe(false)
    expect(
      await session.evaluate(
        () => document.querySelector('#content').textContent
      )
    ).toBe('Hello Bar!')

    await cleanup()
  })
})
