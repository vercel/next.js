import { nextTestSetup } from 'e2e-utils'
import * as cheerio from 'cheerio'
import { readdir } from 'fs/promises'
import { join } from 'path'

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
    expect(await next.hasFile('out')).toBe(false)

    const generated = await next.build({
      args: ['--experimental-build-mode', 'generate'],
    })
    expect(generated.exitCode).toBe(0)
    const $ = cheerio.load(await next.readFile('out/index.html'))
    expect($('#split-build').text()).toBe('Split build export')
    expect(await next.hasFile('out/404.html')).toBe(true)
  })
})

// This regression covers ordinary App Router exports independently of CC support.
// @force-gate start
describe('output export build modes with ordinary app router', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'legacy-app-router'),
    skipStart: true,
    nextConfig: {
      output: 'export',
      cacheComponents: false,
      experimental: { cachedNavigations: false },
    },
  })

  it('copies generated pages and metadata from the generate manifest', async () => {
    const compiled = await next.build({
      args: ['--experimental-build-mode', 'compile'],
    })
    expect(compiled.exitCode).toBe(0)
    expect(await next.hasFile('out')).toBe(false)
    const generated = await next.build({
      args: ['--experimental-build-mode', 'generate'],
    })
    expect(generated.exitCode).toBe(0)
    for (const [slug, title, body] of [
      ['first', 'First post', 'Content for the first post.'],
      ['second', 'Second post', 'Content for the second post.'],
    ]) {
      const $ = cheerio.load(await next.readFile(`out/${slug}.html`))
      expect($('title').text()).toBe(title)
      expect($('h1').text()).toBe(title)
      expect($('p').text()).toBe(body)
    }
    expect(await next.hasFile('out/404.html')).toBe(true)
    const files = await readdir(join(next.testDir, 'out'))
    expect(files.join('\n')).not.toMatch(/\[slug\]|%5bslug%5d/i)
  })
})
