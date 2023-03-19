import { getPageStaticInfo } from 'next/dist/build/analysis/get-page-static-info'
import { join } from 'path'

const fixtureDir = join(__dirname, 'fixtures')

function createNextConfig(runtime?: 'experimental-edge' | 'nodejs') {
  return {
    experimental: { runtime },
  }
}

describe('parse page static info', () => {
  it('should parse nodejs runtime correctly', async () => {
    const { runtime, ssr, ssg } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/nodejs-ssr.js'),
      nextConfig: createNextConfig(),
      pageType: 'pages',
    })
    expect(runtime).toBe('nodejs')
    expect(ssr).toBe(true)
    expect(ssg).toBe(false)
  })

  it('should parse static runtime correctly', async () => {
    const { runtime, ssr, ssg } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/nodejs.js'),
      nextConfig: createNextConfig(),
      pageType: 'pages',
    })
    expect(runtime).toBe(undefined)
    expect(ssr).toBe(false)
    expect(ssg).toBe(false)
  })

  it('should parse edge runtime correctly', async () => {
    const { runtime } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/edge.js'),
      nextConfig: createNextConfig(),
      pageType: 'pages',
    })
    expect(runtime).toBe('experimental-edge')
  })

  it('should return undefined if no runtime is specified', async () => {
    const { runtime } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/static.js'),
      nextConfig: createNextConfig(),
      pageType: 'pages',
    })
    expect(runtime).toBe(undefined)
  })

  it('should parse ssr info with variable exported gSSP correctly', async () => {
    const { ssr, ssg } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/ssr-variable-gssp.js'),
      nextConfig: createNextConfig(),
      pageType: 'pages',
    })
    expect(ssr).toBe(true)
    expect(ssg).toBe(false)
  })
})

describe('fallback to the global runtime configuration', () => {
  it('should fallback when gSP is defined and exported', async () => {
    const { runtime, ssr, ssg } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/fallback-with-gsp.js'),
      nextConfig: createNextConfig('experimental-edge'),
      pageType: 'pages',
    })
    expect(runtime).toBe('experimental-edge')
    expect(ssr).toBe(false)
    expect(ssg).toBe(true)
  })

  it('should fallback when gSP is re-exported from other module', async () => {
    const { runtime, ssr, ssg } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/fallback-re-export-gsp.js'),
      nextConfig: createNextConfig('experimental-edge'),
      pageType: 'pages',
    })
    expect(runtime).toBe('experimental-edge')
    expect(ssr).toBe(false)
    expect(ssg).toBe(true)
  })

  it('should always fallback to the global runtime for app', async () => {
    const { runtime, ssr, ssg } = await getPageStaticInfo({
      pageFilePath: join(fixtureDir, 'page-runtime/static.js'),
      nextConfig: createNextConfig('experimental-edge'),
      pageType: 'app',
    })
    expect(runtime).toBe('experimental-edge')
    expect(ssr).toBe(false)
    expect(ssg).toBe(false)
  })
})
