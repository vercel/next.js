/* eslint-env jest */

import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join } from 'path'

const resolveDataDir = join(__dirname, 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')

describe('recursiveReadDir', () => {
  it('should work', async () => {
    const result = await recursiveReadDir(dirWithPages, /\.js/)
    const pages = [
      /^[\\/]index\.js/,
      /^[\\/]custom_ext\.page\.js/,
      /^[\\/]prefered\.js/,
      /^[\\/]prefered\.other\.js/,
      /^[\\/]nav[\\/]about\.js/,
      /^[\\/]nav[\\/]index\.js/,
      /^[\\/]nested[\\/]index\.js/,
      /^[\\/]prefered[\\/]index\.js/,
      /^[\\/]prefered[\\/]index\.other\.js/,
      /^[\\/]nav[\\/]products[\\/]product\.js/,
    ]
    expect(
      result.filter((item) => {
        for (const page of pages) {
          if (page.test(item)) {
            return false
          }
        }

        return true
      }).length
    ).toBe(0)
  })
})
