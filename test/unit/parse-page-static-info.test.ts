import { getPagesPageStaticInfo } from 'next/dist/build/analysis/get-page-static-info'
import { installBindings } from 'next/dist/build/swc/install-bindings'
import { PAGE_TYPES } from 'next/dist/lib/page-types'
import { join } from 'path'
import { createPage } from 'next/dist/shared/lib/route-types'

const fixtureDir = join(__dirname, 'fixtures')

function createNextConfig() {
  return {}
}

describe('parse page static info', () => {
  beforeAll(async () => {
    await installBindings()
  })
  it('should parse nodejs runtime correctly', async () => {
    const { runtime } = await getPagesPageStaticInfo({
      page: createPage('nodejs-ssr'),
      pageFilePath: join(fixtureDir, 'page-runtime/nodejs-ssr.js'),
      nextConfig: createNextConfig(),
      pageType: PAGE_TYPES.PAGES,
      isDev: false,
    })
    expect(runtime).toBe('nodejs')
  })

  it('should parse static runtime correctly', async () => {
    const { runtime } = await getPagesPageStaticInfo({
      page: createPage('nodejs'),
      pageFilePath: join(fixtureDir, 'page-runtime/nodejs.js'),
      nextConfig: createNextConfig(),
      pageType: PAGE_TYPES.PAGES,
      isDev: false,
    })
    expect(runtime).toBe('nodejs')
  })

  it('should parse edge runtime correctly', async () => {
    const { runtime } = await getPagesPageStaticInfo({
      page: createPage('edge'),
      pageFilePath: join(fixtureDir, 'page-runtime/edge.js'),
      nextConfig: createNextConfig(),
      pageType: PAGE_TYPES.PAGES,
      isDev: false,
    })
    expect(runtime).toBe('experimental-edge')
  })

  it('should return undefined if no runtime is specified', async () => {
    const { runtime } = await getPagesPageStaticInfo({
      page: createPage('static'),
      pageFilePath: join(fixtureDir, 'page-runtime/static.js'),
      nextConfig: createNextConfig(),
      pageType: PAGE_TYPES.PAGES,
      isDev: false,
    })
    expect(runtime).toBe(undefined)
  })
})
