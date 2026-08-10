import { nextTestSetup } from 'e2e-utils'

describe('MDX-rs Plugin support', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/mdx': 'canary',
      '@mdx-js/loader': '*',
      '@mdx-js/react': '*',
    },
  })

  it('should render an MDX page correctly', async () => {
    expect(await next.render('/')).toMatch(/Hello MDX/)
  })

  it('should render an MDX page with component correctly', async () => {
    expect(await next.render('/button')).toMatch(/Look, a button!/)
  })

  it('should render an MDX page with globally provided components (from `mdx-components.js`) correctly', async () => {
    expect(await next.render('/provider')).toMatch(/Marker was rendered!/)
  })
})

describe('MDX-rs Plugin support with mdx transform options', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/mdx': 'canary',
      '@mdx-js/loader': '*',
      '@mdx-js/react': '*',
    },
    skipStart: true,
  })

  beforeAll(async () => {
    await next.patchFile(
      'next.config.js',
      `
      const withMDX = require('@next/mdx')({
        extension: /\\.mdx?$/,
      })
      module.exports = withMDX({
        pageExtensions: ['js', 'jsx', 'mdx'],
        experimental: {
          mdxRs: {
            mdxType: 'gfm'
          },
        },
      })
    `
    )
    await next.start()
  })

  it('should render an MDX page correctly', async () => {
    expect(await next.render('/gfm')).toMatch(/<table>\n<thead>\n<tr>\n<th>foo/)
  })
})
