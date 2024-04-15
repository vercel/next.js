/* eslint-env jest */

import { promises } from 'fs'
import { join } from 'path'
import { nextBuild, File } from 'next-test-utils'

const { readFile, access, stat } = promises
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')

const nextConfig = new File(join(appDir, 'next.config.js'))

const fileExist = (path) =>
  access(path)
    .then(() => stat(path))
    .then((stats) => (stats.isFile() ? true : false))
    .catch(() => false)

// Issue #36855
// https://github.com/vercel/next.js/issues/36855
describe('Static 404 Export', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('only export 404.html when trailingSlash: false', async () => {
        await nextBuild(appDir)

        expect(await fileExist(join(outdir, '404.html'))).toBe(true)
        expect(await fileExist(join(outdir, '404.html.html'))).toBe(false)
        expect(await fileExist(join(outdir, '404/index.html'))).toBe(false)
      })

      it('export 404.html and 404/index.html when trailingSlash: true', async () => {
        nextConfig.replace(`trailingSlash: false`, `trailingSlash: true`)
        await nextBuild(appDir)
        nextConfig.restore()

        expect(await fileExist(join(outdir, '404/index.html'))).toBe(true)
        expect(await fileExist(join(outdir, '404.html.html'))).toBe(false)
        expect(await fileExist(join(outdir, '404.html'))).toBe(true)
      })
    }
  )
})

describe('Export with a page named 404.js', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should export a custom 404.html instead of default 404.html', async () => {
        await nextBuild(appDir)

        const html = await readFile(join(outdir, '404.html'), 'utf8')
        expect(html).toMatch(
          /this is a 404 page override the default 404\.html/
        )
      })
    }
  )
})
