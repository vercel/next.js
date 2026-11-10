import { nextTestSetup } from 'e2e-utils'

// The static workers that collect page data and prerender pages can be started
// before the build sets `NEXT_PHASE` on the main process (Turbopack starts
// them before compiling). They must still see the production build phase.
describe('static-worker-env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('exposes NEXT_PHASE to generateStaticParams and prerendering', async () => {
    const $ = await next.render$('/phase-production-build')
    expect($('#param-phase').text()).toBe('phase-production-build')
    expect($('#render-phase').text()).toBe('phase-production-build')

    const prerenderManifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )
    expect(Object.keys(prerenderManifest.routes)).toContain(
      '/phase-production-build'
    )
  })
})
