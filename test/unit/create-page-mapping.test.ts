/* eslint-env jest */

import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { createPagesMapping } from 'next/dist/build/entries'
import { join } from 'path'

const resolveDataDir = join(__dirname, 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')

describe('createPagesMapping', () => {
  it('should resolve all page paths', async () => {
    const pagePaths = await recursiveReadDir(dirWithPages, /\.js/)

    const {
      '/_app': _app,
      '/_error': _error,
      '/_document': _document,
      ...pageMapping
    } = createPagesMapping(pagePaths, ['js'], true, false)

    const readdirPageMapping = {
      '/': '/index.js',
      '/nav': '/nav/index.js',
      '/nav/about': '/nav/about.js',
      '/nav/products/product': '/nav/products/product.js',
      '/nested': '/nested/index.js',
      '/prefered': '/prefered.js',
      '/prefered.other': '/prefered.other.js',
      '/prefered/index.other': '/prefered/index.other.js',
      '/custom_ext.page': '/custom_ext.page.js',
    }

    expect(
      Object.entries(pageMapping).filter(([pageKey, pagePath]) => {
        const ending = readdirPageMapping[pageKey]
        return !ending || !pagePath.replace(/\\/g, '/').endsWith(ending)
      }).length
    ).toBe(0)
  })

  it('should resolve .other.js before .js', async () => {
    const pagePaths = await recursiveReadDir(dirWithPages, /\.js/)

    const {
      '/_app': _app,
      '/_error': _error,
      '/_document': _document,
      ...pageMapping
    } = createPagesMapping(pagePaths, ['other.js', 'js'], true, false)

    const readdirPageMapping = {
      '/': '/index.js',
      '/nav': '/nav/index.js',
      '/nav/about': '/nav/about.js',
      '/nav/products/product': '/nav/products/product.js',
      '/nested': '/nested/index.js',
      '/prefered': '/prefered.other.js',
      '/custom_ext.page': '/custom_ext.page.js',
    }

    expect(
      Object.entries(pageMapping).filter(([pageKey, pagePath]) => {
        const ending = readdirPageMapping[pageKey]
        return !ending || !pagePath.replace(/\\/g, '/').endsWith(ending)
      }).length
    ).toBe(0)
  })

  it('should resolve .js before .other.js', async () => {
    const pagePaths = await recursiveReadDir(dirWithPages, /\.js/)

    const {
      '/_app': _app,
      '/_error': _error,
      '/_document': _document,
      ...pageMapping
    } = createPagesMapping(pagePaths, ['js', 'other.js'], true, false)

    const readdirPageMapping = {
      '/': '/index.js',
      '/nav': '/nav/index.js',
      '/nav/about': '/nav/about.js',
      '/nav/products/product': '/nav/products/product.js',
      '/nested': '/nested/index.js',
      '/prefered': '/prefered.js',
      '/custom_ext.page': '/custom_ext.page.js',
    }

    expect(
      Object.entries(pageMapping).filter(([pageKey, pagePath]) => {
        const ending = readdirPageMapping[pageKey]
        return !ending || !pagePath.replace(/\\/g, '/').endsWith(ending)
      }).length
    ).toBe(0)
  })

  it('should only resolve .page.js', async () => {
    const pagePaths = await recursiveReadDir(dirWithPages, /\.js/)

    const {
      '/_app': _app,
      '/_error': _error,
      '/_document': _document,
      ...pageMapping
    } = createPagesMapping(pagePaths, ['page.js'], true, false)

    const readdirPageMapping = {
      '/custom_ext': '/custom_ext.page.js',
    }

    expect(
      Object.entries(pageMapping).filter(([pageKey, pagePath]) => {
        const ending = readdirPageMapping[pageKey]
        return !ending || !pagePath.replace(/\\/g, '/').endsWith(ending)
      }).length
    ).toBe(0)
  })
})
