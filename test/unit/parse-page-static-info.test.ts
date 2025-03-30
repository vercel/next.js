import { getPagesPageStaticInfo } from 'next/dist/build/analysis/get-page-static-info'
import { PAGE_TYPES } from 'next/dist/lib/page-types'
import { join } from 'path'

const fixtureDir = join(__dirname, 'fixtures')

function createNextConfig() {
  return {}
}

describe('parse page static info', () => {
  it('should parse nodejs runtime correctly', async () => {
    const { runtime, getServerSideProps, getStaticProps } =
      await getPagesPageStaticInfo({
        page: 'nodejs-ssr',
        pageFilePath: join(fixtureDir, 'page-runtime/nodejs-ssr.js'),
        nextConfig: createNextConfig(),
        pageType: PAGE_TYPES.PAGES,
      })
    expect(runtime).toBe('nodejs')
    expect(getServerSideProps).toBe(true)
    expect(getStaticProps).toBe(false)
  })

  it('should parse static runtime correctly', async () => {
    const { runtime, getServerSideProps, getStaticProps } =
      await getPagesPageStaticInfo({
        page: 'nodejs',
        pageFilePath: join(fixtureDir, 'page-runtime/nodejs.js'),
        nextConfig: createNextConfig(),
        pageType: PAGE_TYPES.PAGES,
      })
    expect(runtime).toBe('nodejs')
    expect(getServerSideProps).toBe(false)
    expect(getStaticProps).toBe(false)
  })

  it('should parse edge runtime correctly', async () => {
    const { runtime } = await getPagesPageStaticInfo({
      page: 'edge',
      pageFilePath: join(fixtureDir, 'page-runtime/edge.js'),
      nextConfig: createNextConfig(),
      pageType: PAGE_TYPES.PAGES,
    })
    expect(runtime).toBe('experimental-edge')
  })

  it('should return undefined if no runtime is specified', async () => {
    const { runtime } = await getPagesPageStaticInfo({
      page: 'static',
      pageFilePath: join(fixtureDir, 'page-runtime/static.js'),
      nextConfig: createNextConfig(),
      pageType: PAGE_TYPES.PAGES,
    })
    expect(runtime).toBe(undefined)
  })

  it('should parse ssr info with variable exported gSSP correctly', async () => {
    const { getServerSideProps, getStaticProps } = await getPagesPageStaticInfo(
      {
        page: 'ssr-variable-gssp',
        pageFilePath: join(fixtureDir, 'page-runtime/ssr-variable-gssp.js'),
        nextConfig: createNextConfig(),
        pageType: PAGE_TYPES.PAGES,
      }
    )
    expect(getStaticProps).toBe(false)
    expect(getServerSideProps).toBe(true)
  })
})
