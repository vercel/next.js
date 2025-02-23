import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('build-output-tree-view', () => {
  describe('with mixed static and dynamic pages and app router routes', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/mixed'),
      skipStart: true,
      env: {
        __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
      },
    })

    beforeAll(() => next.build())

    it('should show info about prerendered and dynamic routes in a tree view', async () => {
      // TODO: Show cache info (revalidate/expire) for app router, and use the
      // same for pages router instead of the ISR addendum.

      // TODO: Fix double-listing of the /ppr/[slug] fallback.

      expect(getTreeView(next.cliOutput)).toMatchInlineSnapshot(`
       "Route (app)                             Size    First Load JS
       ┌ ○ /_not-found                         N/A kB         N/A kB
       ├ ƒ /api                                N/A kB         N/A kB
       ├ ○ /api/force-static                   N/A kB         N/A kB
       ├ ○ /app-static                         N/A kB         N/A kB
       ├ ○ /cache-life                         N/A kB         N/A kB
       ├ ƒ /dynamic                            N/A kB         N/A kB
       ├ ◐ /ppr/[slug]                         N/A kB         N/A kB
       ├   ├ /ppr/[slug]
       ├   ├ /ppr/[slug]
       ├   ├ /ppr/days
       ├   └ /ppr/weeks
       └ ○ /revalidate                         N/A kB         N/A kB
       + First Load JS shared by all           N/A kB

       Route (pages)                           Size    First Load JS
       ┌ ƒ /api/hello                          N/A kB         N/A kB
       ├ ● /gsp-revalidate (ISR: 300 Seconds)  N/A kB         N/A kB
       ├ ƒ /gssp                               N/A kB         N/A kB
       └ ○ /static                             N/A kB         N/A kB
       + First Load JS shared by all           N/A kB

       ○  (Static)             prerendered as static content
       ●  (SSG)                prerendered as static HTML (uses generateStaticParams)
          (ISR)                incremental static regeneration (uses revalidate in generateStaticParams)
       ◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
       ƒ  (Dynamic)            server-rendered on demand"
      `)
    })
  })

  describe('with only a few static routes', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/minimal-static'),
      skipStart: true,
      env: {
        __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
      },
    })

    beforeAll(() => next.build())

    it('should show info about prerendered routes in a compact tree view', async () => {
      expect(getTreeView(next.cliOutput)).toMatchInlineSnapshot(`
       "Route (app)                    Size    First Load JS
       ┌ ○ /                          N/A kB         N/A kB
       └ ○ /_not-found                N/A kB         N/A kB
       + First Load JS shared by all  N/A kB

       Route (pages)                  Size    First Load JS
       ─ ○ /static                    N/A kB         N/A kB
       + First Load JS shared by all  N/A kB

       ○  (Static)  prerendered as static content"
      `)
    })
  })
})

function getTreeView(cliOutput: string): string {
  let foundBuildTracesLine = false
  const lines: string[] = []

  for (const line of cliOutput.split('\n')) {
    if (foundBuildTracesLine) {
      lines.push(line)
    }

    foundBuildTracesLine ||= line.includes('Collecting build traces')
  }

  return lines.join('\n').trim()
}
