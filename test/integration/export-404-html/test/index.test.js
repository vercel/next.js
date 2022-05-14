/* eslint-env jest */

import { join } from 'path'
import { nextBuild, nextExport, File } from 'next-test-utils'

import { promises } from 'fs'

const { access, stat } = promises
const appDir = join(__dirname, '../')
const outdir = join(appDir, 'out')
const context = {}
context.appDir = appDir
const nextConfig = new File(join(appDir, 'next.config.js'))

const fileExist = (path) =>
  access(path)
    .then(() => stat(path))
    .then((stats) => (stats.isFile() ? true : false))
    .catch(() => false)

// Issue #36855
// https://github.com/vercel/next.js/issues/36855
describe('Static 404 Export', () => {
  it('only export 404.html when trailingSlash: false', async () => {
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })

    expect(await fileExist(join(outdir, '404.html'))).toBe(true)
    expect(await fileExist(join(outdir, '404.html.html'))).toBe(false)
    expect(await fileExist(join(outdir, '404/index.html'))).toBe(false)
  })

  it('export 404.html and 404/index.html when trailingSlash: true', async () => {
    nextConfig.replace(`trailingSlash: false`, `trailingSlash: true`)
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })
    nextConfig.restore()

    expect(await fileExist(join(outdir, '404/index.html'))).toBe(true)
    expect(await fileExist(join(outdir, '404.html.html'))).toBe(false)
    expect(await fileExist(join(outdir, '404.html'))).toBe(true)
  })
})
