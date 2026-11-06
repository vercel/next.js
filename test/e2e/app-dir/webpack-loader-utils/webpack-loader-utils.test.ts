import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-utils', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'style-loader': '4.0.0',
    },
  })

  it('exposes path and hash utilities to loaders', async () => {
    const $ = await next.render$('/')
    expect(JSON.parse($('#utils').text())).toEqual({
      relative: './app/input.utils-test.js?q',
      absolute: true,
      hash: '44bc2cf5ad770999',
      xxhash: '44bc2cf5ad770999',
      webpack: !process.env.IS_TURBOPACK_TEST,
      compiler: !process.env.IS_TURBOPACK_TEST,
      compilationHooks: !process.env.IS_TURBOPACK_TEST,
      compilationHooksRead: process.env.IS_TURBOPACK_TEST
        ? 'Turbopack does not support _compilation.hooks in webpack loaders'
        : 'object',
      compilationOptionsProbe: !!process.env.IS_TURBOPACK_TEST,
      hashOptions: {
        hashFunction: 'xxhash64',
        hashDigest: 'hex',
        hashDigestLength: 16,
        hashSalt: null,
      },
      paths: [
        'styles/panel.module.css?theme=dark#button',
        'component-0-f00d-abc-01234',
      ],
      mode: isNextDev ? 'development' : 'production',
    })
  })

  it('runs style-loader pitching with the real loader context', async () => {
    const $ = await next.render$('/')
    const source = $('#style-loader-source').text()
    expect(source).toContain('injectStylesIntoStyleTag.js')
    expect(source).toContain('!!./styles.style-test.txt')
  })
})
