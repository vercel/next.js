import { getPageStaticInfo } from 'next/dist/build/analysis/get-page-static-info'
import { join } from 'path'

const fixtureDir = join(__dirname, 'fixtures')

function createNextConfig(runtime?: 'edge' | 'nodejs') {
  return {
    experimental: { reactRoot: true, runtime },
  }
}

describe('parse page runtime config', () => {
  it('should parse nodejs runtime correctly', async () => {
    const { runtime } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/nodejs-ssr.js'),
      nextConfig: createNextConfig(),
    })
    expect(runtime).toBe('nodejs')
  })

  it('should parse static runtime correctly', async () => {
    const { runtime } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/nodejs.js'),
      nextConfig: createNextConfig(),
    })
    expect(runtime).toBe(undefined)
  })

  it('should parse edge runtime correctly', async () => {
    const { runtime } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/edge.js'),
      nextConfig: createNextConfig(),
    })
    expect(runtime).toBe('edge')
  })

  it('should return undefined if no runtime is specified', async () => {
    const { runtime } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/static.js'),
      nextConfig: createNextConfig(),
    })
    expect(runtime).toBe(undefined)
  })
})

describe('fallback to the global runtime configuration', () => {
  it('should fallback when gSP is defined and exported', async () => {
    const { runtime } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/fallback-with-gsp.js'),
      nextConfig: createNextConfig('edge'),
    })
    expect(runtime).toBe('edge')
  })

  it('should fallback when gSP is re-exported from other module', async () => {
    const { runtime } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/fallback-re-export-gsp.js'),
      nextConfig: createNextConfig('edge'),
    })
    expect(runtime).toBe('edge')
  })
})
