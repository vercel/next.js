import { nextTestSetup } from 'e2e-utils'

describe('param-matching-build-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function buildRoute(route: string) {
    const { exitCode, cliOutput } = await next.build({
      args: ['--debug-build-paths', `app/${route}/page.tsx`],
    })
    expect({ exitCode, cliOutput }).toEqual({
      exitCode: 0,
      cliOutput: expect.any(String),
    })
    return next.readJSON('.next/prerender-manifest.json')
  }

  it.each(['layout-only', 'generated', 'empty-generated', 'overridden'])(
    'records parameter matching used by %s',
    async (route) => {
      const manifest = await buildRoute(`${route}/[slug]`)
      expect(manifest.hasParamMatching).toBe(true)
    }
  )

  it('does not mark unconfigured dynamic routes', async () => {
    const manifest = await buildRoute('unconfigured/[slug]')
    expect(manifest).not.toHaveProperty('hasParamMatching')
  })

  it('clears the marker when the last matching export is removed', async () => {
    const route = 'layout-only/[slug]'
    expect((await buildRoute(route)).hasParamMatching).toBe(true)

    await next.patchFile(
      `app/${route}/layout.tsx`,
      (content) =>
        content.replace(
          "export const unstable_paramMatching = { slug: 'fallback' } as const\n",
          ''
        ),
      async () => {
        const manifest = await buildRoute(route)
        expect(manifest).not.toHaveProperty('hasParamMatching')
      }
    )
  })
})
