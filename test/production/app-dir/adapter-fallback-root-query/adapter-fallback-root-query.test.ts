import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import type { NextAdapter } from 'next'

describe('adapter-fallback-root-query', () => {
  const { next, isTurbopack } = nextTestSetup({ files: __dirname })

  it('uses the same root query key in a fallback output and its routing rule', async () => {
    // Re-run the real adapter emitter with a servable fallback. The test owns
    // only this manifest input; build files and routing metadata are real.
    await execa(
      process.execPath,
      ['emit-fallback.mjs', isTurbopack ? 'turbo' : 'webpack'],
      { cwd: next.testDir }
    )
    const { outputs, routing }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('adapter-output.json')
    const output = outputs.prerenders.find(
      (item) => item.pathname === '/[lang]'
    )
    expect(output).toBeDefined()
    expect(output.fallback.filePath).toContain('[lang].html')
    expect(output.config.allowQuery).toEqual(['nxtPlang'])
    expect(
      routing.dynamicRoutes.some((route) =>
        route.destination?.includes('nxtPlang=')
      )
    ).toBe(true)
  })
})
