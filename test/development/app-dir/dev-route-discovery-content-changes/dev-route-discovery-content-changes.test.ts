import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// When a file's contents change but the set of files does not, the dev server
// reuses its last route discovery pass instead of recomputing every route.
// The pass still has to run again for the files whose contents route
// discovery reads (env, tsconfig, proxy, metadata routes) and whenever files
// are added or removed.
describe('dev-route-discovery-content-changes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('applies content edits to a page', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    await next.patchFile(
      'app/page.tsx',
      (content) => content!.replace('hello world', 'hello edited'),
      async () => {
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('hello edited')
        })
        expect(await next.render('/')).toContain('hello edited')
      }
    )
  })

  // The `dynamicParams` segment config is not supported with Cache Components.
  // @force-gate !cacheComponents
  it('applies segment config edits to a page', async () => {
    const known = await next.fetch('/params/known')
    expect(known.status).toBe(200)
    expect((await next.fetch('/params/unknown')).status).toBe(200)

    await next.patchFile(
      'app/params/[slug]/page.tsx',
      (content) => `export const dynamicParams = false\n${content}`,
      async () => {
        await retry(async () => {
          expect((await next.fetch('/params/unknown')).status).toBe(404)
        })
        expect((await next.fetch('/params/known')).status).toBe(200)
      }
    )
  })

  it('picks up pages added and removed after startup', async () => {
    expect((await next.fetch('/added')).status).toBe(404)

    await next.patchFile(
      'app/added/page.tsx',
      'export default function Page() { return <p>added page</p> }',
      async () => {
        await retry(async () => {
          const res = await next.fetch('/added')
          expect(res.status).toBe(200)
          expect(await res.text()).toContain('added page')
        })
      }
    )

    await retry(async () => {
      expect((await next.fetch('/added')).status).toBe(404)
    })
  })

  it('reloads env files when they change', async () => {
    expect(await (await next.fetch('/env')).json()).toEqual({ value: 'first' })

    await next.patchFile('.env', 'ROUTE_DISCOVERY_VALUE=second\n', async () => {
      await retry(async () => {
        expect(await (await next.fetch('/env')).json()).toEqual({
          value: 'second',
        })
      })
    })
  })

  it('reloads the proxy matcher when the proxy changes', async () => {
    expect((await next.fetch('/first-match')).headers.get('x-proxied')).toBe(
      'yes'
    )
    expect(
      (await next.fetch('/second-match')).headers.get('x-proxied')
    ).toBeNull()

    await next.patchFile(
      'proxy.ts',
      (content) => content!.replace("'/first-match'", "'/second-match'"),
      async () => {
        await retry(async () => {
          expect(
            (await next.fetch('/second-match')).headers.get('x-proxied')
          ).toBe('yes')
          expect(
            (await next.fetch('/first-match')).headers.get('x-proxied')
          ).toBeNull()
        })
      }
    )
  })

  it('reloads metadata routes when their exports change', async () => {
    expect((await next.fetch('/sitemap.xml')).status).toBe(200)
    expect((await next.fetch('/sitemap/0.xml')).status).toBe(404)

    await next.patchFile(
      'app/sitemap.ts',
      `import type { MetadataRoute } from 'next'

export async function generateSitemaps() {
  return [{ id: 0 }]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [{ url: 'https://example.com/0' }]
}
`,
      async () => {
        // Route discovery derives the sitemap's route from its exports.
        await retry(async () => {
          expect((await next.fetch('/sitemap/0.xml')).status).toBe(200)
        })
      }
    )
  })

  it('reloads tsconfig path aliases when tsconfig.json changes', async () => {
    // Add the page first, so the tsconfig.json edit below is a content-only
    // change on its own.
    await next.patchFile(
      'app/alias/page.tsx',
      `import { value } from '@alias/value'

export default function Page() {
  return <p>{value}</p>
}
`,
      async () => {
        await retry(async () => {
          expect((await next.fetch('/alias')).status).toBe(500)
        })

        await next.patchFile(
          'tsconfig.json',
          (content) =>
            content!.replace(
              '"@/*": ["./*"]',
              '"@/*": ["./*"], "@alias/*": ["./lib/*"]'
            ),
          async () => {
            await retry(async () => {
              const res = await next.fetch('/alias')
              expect(res.status).toBe(200)
              expect(await res.text()).toContain('from alias')
            })
          }
        )
      }
    )
  })
})
