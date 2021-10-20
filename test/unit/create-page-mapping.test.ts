/* eslint-env jest */

import { collectPages } from 'next/dist/build/utils'
import { createPagesMapping } from 'next/dist/build/entries'
import { join } from 'path'

const resolveDataDir = join(__dirname, 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')

async function checkPageMapping(
  extensions: string[],
  matchPageMatching: { [pageKey: string]: string }
) {
  const pagePaths = await collectPages(dirWithPages, extensions)

  const {
    '/_app': _app,
    '/_error': _error,
    '/_document': _document,
    ...pageMapping
  } = createPagesMapping(pagePaths, extensions, true, false)

  expect(
    Object.entries(pageMapping).filter(([pageKey, pagePath]) => {
      const ending = matchPageMatching[pageKey]
      return !ending || !pagePath.replace(/\\/g, '/').endsWith(ending)
    }).length
  ).toBe(0)
}

describe('createPagesMapping', () => {
  it('should resolve all page paths', async () => {
    await checkPageMapping(['js'], {
      '/': '/index.js',
      '/nav': '/nav/index.js',
      '/nav/about': '/nav/about.js',
      '/nav/products/product': '/nav/products/product.js',
      '/nested': '/nested/index.js',
      '/prefered': '/prefered.js',
      '/prefered.other': '/prefered.other.js',
      '/prefered/index.other': '/prefered/index.other.js',
      '/custom_ext.page': '/custom_ext.page.js',
    })
  })

  it('should resolve .other.js before .js', async () => {
    await checkPageMapping(['other.js', 'js'], {
      '/': '/index.js',
      '/nav': '/nav/index.js',
      '/nav/about': '/nav/about.js',
      '/nav/products/product': '/nav/products/product.js',
      '/nested': '/nested/index.js',
      '/prefered': '/prefered.other.js',
      '/custom_ext.page': '/custom_ext.page.js',
    })
  })

  it('should resolve .js before .other.js', async () => {
    await checkPageMapping(['js', 'other.js'], {
      '/': '/index.js',
      '/nav': '/nav/index.js',
      '/nav/about': '/nav/about.js',
      '/nav/products/product': '/nav/products/product.js',
      '/nested': '/nested/index.js',
      '/prefered': '/prefered.js',
      '/custom_ext.page': '/custom_ext.page.js',
    })
  })

  it('should only resolve .page.js', async () => {
    await checkPageMapping(['page.js'], {
      '/custom_ext': '/custom_ext.page.js',
    })
  })
})
