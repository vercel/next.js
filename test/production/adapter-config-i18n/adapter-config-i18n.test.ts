import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'
import { RouteKind } from 'next/dist/server/route-kind'

describe('adapter config with i18n response artifacts', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['en', 'fr'])(
    'resolves %s prerenders and fallback shells to scoped files',
    async (locale) => {
      const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
        await next.readJSON('build-complete.json')
      for (const [suffix, sourceRoute] of [
        ['fallback/first', '/fallback/[slug]'],
        ['fallback/[slug]', '/fallback/[slug]'],
      ]) {
        const pathname = `/${locale}/${suffix}`
        const output = outputs.find((item) => item.pathname === pathname)
        const artifact = next.getPrerenderFilePath(pathname, '.html', {
          router: 'pages',
          route: { kind: RouteKind.PAGES, sourceRoute },
        })
        // Next 15 has no localized fallback outputs in its flat adapter schema.
        // Assert the emitted positive route and both localized build shell files.
        if (!suffix.includes('[slug]')) {
          expect(output?.fallback?.filePath).toBe(
            path.join(next.testDir, artifact)
          )
        }
        expect(await next.hasFile(artifact)).toBe(true)
        expect(await next.hasFile(artifact.replace(/\.html$/, '.meta'))).toBe(
          true
        )
        if (!suffix.includes('[slug]'))
          expect(await next.hasFile(artifact.replace(/\.html$/, '.json'))).toBe(
            true
          )
        for (const extension of ['.html', '.json', '.meta']) {
          expect(
            await next.hasFile(`.next/server/pages${pathname}${extension}`)
          ).toBe(false)
        }
      }
    }
  )
})
