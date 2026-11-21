import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-utils', () => {
  const { next, isNextDev, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'style-loader': '4.0.0',
    },
  })

  it('exposes path and hash utilities to loaders', async () => {
    const $ = await next.render$('/')
    const { webpack, ...utils } = JSON.parse($('#utils').text())
    expect(utils).toEqual({
      relative: './app/input.utils-test.js?q',
      absolute: true,
      hash: '44bc2cf5ad770999',
      xxhash: '44bc2cf5ad770999',
      compiler: !isTurbopack,
      mode: isNextDev ? 'development' : 'production',
    })
    if (isRspack) {
      expect(webpack).toBe(false)
    } else {
      expect(webpack).toBe(!isTurbopack)
    }
  })

  it('runs style-loader pitching with the real loader context', async () => {
    const $ = await next.render$('/')
    const source = $('#style-loader-source').text()
    expect(source).toContain('injectStylesIntoStyleTag.js')
    expect(source).toContain('!!./styles.style-test.txt')
  })
})
