import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Number of chained shared (non-"use client") modules the page pulls in.
// Module evaluation recurses once per module, so a chain this deep overflows
// the server's call stack while the route is being rendered.
const CHAIN_DEPTH = 2000

function createChainFiles() {
  const files: Record<string, string> = {}

  for (let i = 0; i < CHAIN_DEPTH; i++) {
    files[`lib/chain/mod${i}.js`] =
      i === CHAIN_DEPTH - 1
        ? `export const value = 'deep-chain-leaf'\n`
        : `import { value as next } from './mod${i + 1}'\nexport const value = next\n`
  }

  return files
}

// Documents the current (incorrect) behavior: a deep import chain overflows the
// stack during module evaluation and the whole document is replaced by the
// Pages Router 500 shell instead of an isolated, app-shell-preserving error.
// Only reproducible with Turbopack in `next dev`. Webpack does not reach module
// evaluation before this intentionally oversized fixture times out in CI.
// @force-gate dev && turbopack
describe('cache-components - deep import chain - dev module evaluation', () => {
  const { next } = nextTestSetup({
    files: {
      'next.config.js': `module.exports = { cacheComponents: true }\n`,
      'app/layout.tsx': `export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div id="root-layout-marker" />
        {children}
      </body>
    </html>
  )
}
`,
      'app/page.tsx': `import { value } from '../lib/chain/mod0'

export default function Page() {
  return <p id="leaf">{value}</p>
}
`,
      ...createChainFiles(),
    },
  })

  it('serves the Pages Router 500 shell when module evaluation overflows the stack', async () => {
    const res = await next.fetch('/')
    const html = await res.text()

    // Current behavior: the request fails outright instead of rendering.
    expect(res.status).toBe(500)

    // The App Router output is gone: neither the root layout nor the page's
    // own content make it into the document, and no flight payload is sent.
    expect(html).not.toContain('root-layout-marker')
    expect(html).not.toContain('deep-chain-leaf')
    expect(html).not.toContain('self.__next_f.push')

    // What is served instead is the Pages Router error shell.
    expect(html).toContain('__NEXT_DATA__')

    await retry(async () => {
      expect(next.cliOutput).toContain('Maximum call stack size exceeded')
    })
  })
})
