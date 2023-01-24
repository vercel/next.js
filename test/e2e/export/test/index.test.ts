import { join } from 'path'
import { promises } from 'fs'
import { AddressInfo } from 'net'
import { createNext, FileRef } from 'e2e-utils'

import type { Context } from './types'

const { access, mkdir, writeFile, stat } = promises
const appDir = join(__dirname, '../')
const outdir = 'out'
const outNoTrailSlash = join(appDir, 'outNoTrailSlash')
const context: Context = {
  appDir,
} as any
const devContext: Context = {} as any
const nextConfig = join(appDir, 'next.config.js')

const fileExist = (path) =>
  access(path)
    .then(() => stat(path))
    .then((stats) => (stats.isFile() ? true : false))
    .catch(() => false)

describe('Static Export', () => {
  it('should delete existing exported files', async () => {
    const next = await createNext({
      files: {
        pages: appDir,
      },
      startCommand: '',
    })
    const tempfile = join(outdir, 'temp.txt')
    await next.patchFile(tempfile, 'test')
    await next.export()
    expect(() => next.readFile(tempfile)).toThrow()
  })
  /*beforeAll(async () => {
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })

    nextConfig.replace(
      `exportTrailingSlash: true`,
      `exportTrailingSlash: false`
    )
    await nextBuild(appDir)
    await nextExport(appDir, { outdir: outNoTrailSlash })
    nextConfig.restore()

    context.server = await startStaticServer(outdir)
    context.port = (context.server.address() as AddressInfo).port

    context.serverNoTrailSlash = await startStaticServer(outNoTrailSlash)
    context.portNoTrailSlash = (
      context.serverNoTrailSlash.address() as AddressInfo
    ).port

    devContext.port = await findPort()
    devContext.server = await launchApp(
      join(__dirname, '../'),
      devContext.port,
      true
    )

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(devContext.port, '/'),
      renderViaHTTP(devContext.port, '/dynamic/one'),
    ])
  })
  afterAll(async () => {
    await Promise.all([
      stopApp(context.server),
      killApp(devContext.server),
      stopApp(context.serverNoTrailSlash),
    ])
  })

  it('should honor exportTrailingSlash for 404 page', async () => {
    expect(await fileExist(join(outdir, '404/index.html'))).toBe(true)

    // we still output 404.html for backwards compat
    expect(await fileExist(join(outdir, '404.html'))).toBe(true)
  })

  it('should handle trailing slash in getStaticPaths', async () => {
    expect(await fileExist(join(outdir, 'gssp/foo/index.html'))).toBe(true)

    expect(await fileExist(join(outNoTrailSlash, 'gssp/foo.html'))).toBe(true)
  })

  it('should only output 404.html without exportTrailingSlash', async () => {
    expect(await fileExist(join(outNoTrailSlash, '404/index.html'))).toBe(false)

    expect(await fileExist(join(outNoTrailSlash, '404.html'))).toBe(true)
  })

  it('should not duplicate /index with exportTrailingSlash', async () => {
    expect(await fileExist(join(outdir, 'index/index.html'))).toBe(false)

    expect(await fileExist(join(outdir, 'index.html'))).toBe(true)
  })
  */
})
