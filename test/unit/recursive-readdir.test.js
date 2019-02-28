/* eslint-env jest */
import { recursiveFilter } from 'next/dist/lib/recursive-helpers'
import { join } from 'path'

const resolveDataDir = join(__dirname, '..', 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')

describe('recursiveFilter', () => {
  it('should work', async () => {
    const result = await recursiveFilter(dirWithPages, { files: /\.js/ })
    const pages = [/^[\\/]index\.js/, /^[\\/]prefered\.js/, /^[\\/]nav[\\/]about\.js/, /^[\\/]nav[\\/]index\.js/, /^[\\/]nested[\\/]index\.js/, /^[\\/]prefered[\\/]index\.js/, /^[\\/]nav[\\/]products[\\/]product\.js/]
    expect(result.filter((item) => {
      for (const page of pages) {
        if (page.test(item)) {
          return false
        }
      }

      return true
    }).length).toBe(0)
  })
})
