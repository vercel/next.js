import { RouteKind } from 'next/dist/server/route-kind'
import { nextTestSetup } from 'e2e-utils'

describe.each([false, true])(
  'route-scoped-cache parallel closed route (adapter %s)',
  (adapter) => {
    const { next, skipped } = nextTestSetup({
      // Inspects local artifacts and the experimental adapter output.
      skipDeployment: true,
      files: {
        'next.config.js': `module.exports = { cacheMaxMemorySize: 0, experimental: { cpus: 2, cacheComponents: false, ppr: false, ${adapter ? "adapterPath: require.resolve('./adapter.mjs')" : ''} } }`,
        'adapter.mjs': `import fs from 'fs'; export default { name: 'test', async onBuildComplete(ctx) { await fs.promises.writeFile('outputs.json', JSON.stringify(ctx.outputs)) } }`,
        'app/layout.js':
          'export default function Layout({children}) { return <html><body>{children}</body></html> }',
        'app/stories/layout.js':
          'export default function Layout({children, slot}) { return <>{slot}{children}</> }',
        'app/stories/[slug]/page.js': `
        export const dynamicParams = false
        export function generateStaticParams() { return [{slug: 'known'}] }
        export default async function Page({params}) { return <main>story:{(await params).slug}</main> }
      `,
        'app/stories/@slot/[slug]/page.js': `
        export const dynamicParams = false
        export function generateStaticParams() { return [{slug: 'known'}] }
        export default function Page() { return <aside>slot</aside> }
      `,
        'app/stories/@slot/default.js':
          'export default function Page() { return null }',
      },
    })

    if (skipped) return

    it('admits the listed closed route with the runtime root owner', async () => {
      const meta = await next.readJSON(
        next.getPrerenderFilePath('/stories/known', '.meta', {
          route: adapter
            ? { kind: RouteKind.APP_PAGE, sourceRoute: '/stories/[slug]/page' }
            : undefined,
        })
      )
      expect(meta.routeCache.owner).toEqual({
        kind: 'APP_PAGE',
        sourceRoute: '/stories/[slug]/page',
      })
      if (adapter) {
        const outputs = await next.readJSON('outputs.json')
        const entries = outputs.filter(
          (output) =>
            output.pathname === '/stories/[slug]' && output.type === 'APP_PAGE'
        )
        expect(entries).toHaveLength(1)
        expect(entries[0].filePath).toEndWith('/app/stories/[slug]/page.js')
        expect(Object.values(entries[0].assets)).toContainEqual(
          expect.stringContaining('/app/stories/@slot/[slug]/page.js')
        )
      }
      for (let i = 0; i < 2; i++) {
        const response = await next.fetch('/stories/known')
        expect(response.status).toBe(200)
        expect(await response.text()).toContain('story:')
      }
      expect((await next.fetch('/stories/unknown')).status).toBe(404)
    })
  }
)
