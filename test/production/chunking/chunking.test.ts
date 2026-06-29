import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import { join } from 'path'

// Uses webpack internals (stats.json via webpack-bundle-analyzer).
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)('Chunking', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      lodash: '4.18.1',
      'webpack-bundle-analyzer': 'latest',
    },
  })

  let chunks: string[]
  let stats: any

  beforeAll(async () => {
    const statsRaw = (await next.readFile('.next/stats.json')).replace(
      /"static\\(.*?":?)/g,
      (match) => match.replace(/\\/g, '\\\\')
    )
    stats = JSON.parse(statsRaw)
    chunks = fs.readdirSync(join(next.testDir, '.next', 'static', 'chunks'))
  })

  const existsChunkNamed = (name: string) => {
    return chunks.some((chunk) => new RegExp(name).test(chunk))
  }

  it('should use all url friendly names', () => {
    expect(chunks).toEqual(chunks.map((name) => encodeURIComponent(name)))
  })

  it('should create a framework chunk', () => {
    expect(existsChunkNamed('framework')).toBe(true)
  })

  it('should not create a commons chunk', () => {
    expect(existsChunkNamed('commons')).toBe(false)
  })

  it('should not create a lib chunk for react or react-dom', () => {
    expect(existsChunkNamed('react|react-dom')).toBe(false)
  })

  it('should not preload the build manifest', async () => {
    const $ = await next.render$('/')
    expect(
      [].slice
        .call($('link[rel="preload"][as="script"]'))
        .map((e: any) => e.attribs.href)
        .some((entry: string) => entry.includes('_buildManifest'))
    ).toBe(false)
  })

  it('should execute the build manifest', async () => {
    const $ = await next.render$('/')
    expect(
      Array.from($('script'))
        .map((e: any) => e.attribs.src)
        .some((entry: string) => entry && entry.includes('_buildManifest'))
    ).toBe(true)
  })

  it('should not include more than one instance of react-dom', () => {
    // Match react-dom only when it appears as a directory segment, so pnpm
    // peer-dep path suffixes like ".pnpm/next@x.y.z_react-dom@..." (which
    // appear in CI installs) are not treated as react-dom modules.
    const reactDomModuleRegex = /[\\/]react-dom[\\/]/
    const misplacedReactDom = stats.chunks.some((chunk: any) => {
      if (chunk.names.includes('framework')) {
        return false
      }
      return chunk.modules.some((module: any) => {
        return reactDomModuleRegex.test(module.name)
      })
    })
    expect(misplacedReactDom).toBe(false)
  })

  describe('Serving', () => {
    it('should hydrate with aggressive chunking', async () => {
      const browser = await next.browser('/page2')
      const text = await browser.elementByCss('#padded-str').text()
      expect(text).toBe('__rad__')
      await browser.close()
    })

    it('should load chunks when navigating', async () => {
      const browser = await next.browser('/page3')
      const text = await browser
        .elementByCss('#page2-link')
        .click()
        .waitForElementByCss('#padded-str')
        .elementByCss('#padded-str')
        .text()

      expect(text).toBe('__rad__')
      await browser.close()
    })
  })
})
