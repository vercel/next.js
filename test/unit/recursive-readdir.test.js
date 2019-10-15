/* global fixture, test */
import 'testcafe'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join } from 'path'

const resolveDataDir = join(__dirname, '..', 'isolated', '_resolvedata')
const dirWithPages = join(resolveDataDir, 'readdir', 'pages')

fixture('recursiveReadDir')

test('should work', async t => {
  const result = await recursiveReadDir(dirWithPages, /\.js/)
  const pages = [
    /^[\\/]index\.js/,
    /^[\\/]prefered\.js/,
    /^[\\/]nav[\\/]about\.js/,
    /^[\\/]nav[\\/]index\.js/,
    /^[\\/]nested[\\/]index\.js/,
    /^[\\/]prefered[\\/]index\.js/,
    /^[\\/]nav[\\/]products[\\/]product\.js/
  ]
  await t
    .expect(
      result.filter(item => {
        for (const page of pages) {
          if (page.test(item)) {
            return false
          }
        }

        return true
      }).length
    )
    .eql(0)
})
