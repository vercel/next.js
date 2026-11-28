import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-traced-imports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      // Locally built native bindings disable the persistent cache in a dirty
      // checkout, which the warm build below relies on.
      TURBO_ENGINE_IGNORE_DIRTY: '1',
    },
  })

  it('builds when a loader resolves a module with a dynamic require', async () => {
    const $ = await next.render$('/')
    expect($('main').text()).toBe('Webpack loader traced imports')
  })

  // Turbopack's Node.js loader processes should exit once the compilation is
  // done, instead of staying alive (and holding memory) until the build exits.
  // `runAfterProductionCompile` in next.config.mjs waits for them to exit and
  // records how many are left. Webpack has no such processes, and counting
  // needs `ps`.
  // @force-gate turbopack && !windows
  it('stops loader processes after compilation', async () => {
    expect(await next.readFile('.next/loader-processes.txt')).toBe('0')
  })

  // A warm build runs the loader again for the edited page, without
  // necessarily executing the module graph's own tasks again.
  // @force-gate turbopack && !windows
  it('stops loader processes after compilation in a warm build', async () => {
    await next.stop()
    await next.patchFile('app/page.tsx', (content) =>
      content!.replace('</main>', ' (edited)</main>')
    )
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    expect(await next.readFile('.next/loader-processes.txt')).toBe('0')
  })
})
