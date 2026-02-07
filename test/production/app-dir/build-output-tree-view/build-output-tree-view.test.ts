import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('build-output-tree-view', () => {
  // TODO(NAR-423): Migrate to Cache Components.
  describe.skip('with mixed static and dynamic pages and app router routes', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/mixed'),
      skipStart: true,
      env: {
        __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
      },
    })

    beforeAll(() => next.build())

    it('should show info about prerendered and dynamic routes in a tree view', async () => {
      expect(getTreeView(next.cliOutput)).toMatchInlineSnapshot(`
       "Route (app)             Revalidate  Expire
       ┌ ○ /_not-found
       ├ ƒ /api
       ├ ○ /api/force-static
       ├ ○ /app-static
       ├ ○ /cache-life-custom         ≈7m     ≈2h
       ├ ○ /cache-life-hours           1h      1d
       ├ ƒ /dynamic
       ├ ◐ /ppr/[slug]                 1w     30d
       │ ├ /ppr/[slug]                 1w     30d
       │ ├ /ppr/days                   1d      1w
       │ └ /ppr/weeks                  1w     30d
       └ ○ /revalidate                15m      1y

       Route (pages)           Revalidate  Expire
       ┌ ƒ /api/hello
       ├ ● /gsp-revalidate             5m      1y
       ├ ƒ /gssp
       └ ○ /static

       ○  (Static)             prerendered as static content
       ●  (SSG)                prerendered as static HTML (uses generateStaticParams)
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
       "Route (app)
       ┌ ○ /
       └ ○ /_not-found

       Route (pages)
       ─ ○ /static

       ○  (Static)  prerendered as static content"
      `)
    })
  })
})

function getTreeView(cliOutput: string): string {
  let foundStart = false
  const lines: string[] = []

  for (const line of cliOutput.split('\n')) {
    foundStart ||= line.startsWith('Route ')

    if (foundStart) {
      lines.push(line)
    }
  }

  return lines.join('\n').trim()
}
