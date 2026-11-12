import { nextTestSetup } from 'e2e-utils'
import * as cheerio from 'cheerio'

// This verifies the artifacts produced by local compile/generate builds.
// @force-gate start
describe('output export build modes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    nextConfig: {
      output: 'export',
      cacheComponents: false,
      experimental: { cachedNavigations: false },
    },
  })

  it('defers exporting until generate mode', async () => {
    const compiled = await next.build({
      args: ['--experimental-build-mode', 'compile'],
    })
    expect(compiled.exitCode).toBe(0)
    expect(await next.hasFile('out/index.html')).toBe(false)

    const generated = await next.build({
      args: ['--experimental-build-mode', 'generate'],
    })
    expect(generated.exitCode).toBe(0)
    const $ = cheerio.load(await next.readFile('out/index.html'))
    expect($('#split-build').text()).toBe('Split build export')
    expect(await next.hasFile('out/404.html')).toBe(true)
  })
})
