/* eslint-env jest */
/* global jasmine */
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join } from 'path'

const resolveDataDir = join(__dirname, '..', 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('recursiveReadDir', () => {
  it('should work', async () => {
    const result = await recursiveReadDir(dirWithPages, /\.js/)
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
