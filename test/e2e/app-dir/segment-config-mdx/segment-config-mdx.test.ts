import { nextTestSetup } from 'e2e-utils'

for (const type of ['with-mdx-rs', 'without-mdx-rs']) {
  describe(`MDX route segment config ${type}`, () => {
    const { next, isNextStart } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@next/mdx': 'workspace:*',
        '@mdx-js/loader': '^2.2.1',
        '@mdx-js/react': '^2.2.1',
      },
      env: {
        WITH_MDX_RS: type === 'with-mdx-rs' ? 'true' : 'false',
      },
    })

    it('should render pages with route segment config exports', async () => {
      for (const [path, heading] of [
        ['/segment-config/node', 'Node.js segment config'],
        ['/segment-config/edge', 'Edge segment config'],
        ['/segment-config/static/hello', 'Static segment config'],
      ]) {
        const $ = await next.render$(path)
        expect($('h1').text()).toBe(heading)
      }
    })

    // Output manifests are only available in local production builds.
    if (isNextStart) {
      it('should include MDX maxDuration and preferredRegion exports in the functions config manifest', async () => {
        const manifest = await next.readJSON(
          '.next/server/functions-config-manifest.json'
        )

        expect(manifest.functions['/segment-config/node']).toEqual({
          maxDuration: 30,
          regions: ['iad1'],
        })
        expect(manifest.functions['/segment-config/edge']).toEqual({
          maxDuration: 60,
          regions: ['sfo1', 'iad1'],
        })
      })

      it('should include only the MDX Edge runtime page with its preferred regions in the middleware manifest', async () => {
        const manifest = await next.readJSON(
          '.next/server/middleware-manifest.json'
        )

        expect(manifest.functions['/segment-config/edge/page']).toMatchObject({
          page: '/segment-config/edge/page',
          regions: ['sfo1', 'iad1'],
        })
        expect(manifest.functions['/segment-config/node/page']).toBeUndefined()
      })

      it('should reflect MDX static generation and caching exports in the prerender manifest', async () => {
        const manifest = await next.readJSON('.next/prerender-manifest.json')

        expect(manifest.routes['/segment-config/static/hello']).toMatchObject({
          srcRoute: '/segment-config/static/[slug]',
          initialRevalidateSeconds: 60,
        })
        expect(
          manifest.dynamicRoutes['/segment-config/static/[slug]']
        ).toMatchObject({ fallback: false })
        expect(manifest.routes['/segment-config/node']).toBeUndefined()
        expect(manifest.routes['/segment-config/edge']).toBeUndefined()
      })
    }
  })
}
