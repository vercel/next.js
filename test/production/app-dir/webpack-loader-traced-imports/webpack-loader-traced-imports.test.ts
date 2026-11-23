import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-traced-imports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('builds when a loader resolves a module with a dynamic require', async () => {
    const $ = await next.render$('/')
    expect($('main').text()).toBe('Webpack loader traced imports')
  })

  // Turbopack's Node.js loader processes should exit once the module graph is
  // built, instead of staying alive (and holding memory) until the build exits.
  // `runAfterProductionCompile` in next.config.mjs counts them right after
  // compilation. Webpack has no such processes, and counting needs `ps`.
  // @force-gate turbopack && !windows
  it('stops loader processes after compilation', async () => {
    expect(await next.readFile('.next/loader-processes.txt')).toBe('0')
  })
})
