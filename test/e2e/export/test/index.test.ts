import path from 'path'
import { promises } from 'fs'
import { createNext, createNextDescribe } from 'e2e-utils'

import type { Context } from './types'

const { access, mkdir, writeFile, stat } = promises
const files = path.join(__dirname, '..')
const outdir = 'out'
const outNoTrailSlash = path.join(files, 'outNoTrailSlash')
const context: Context = {} as any
const devContext: Context = {} as any
const nextConfig = path.join(files, 'next.config.js')

createNextDescribe(
  'static export',
  {
    files,
  },
  ({ next, isNextStart }) => {
    if (!isNextStart) return

    it('should delete existing exported files', async () => {
      await next.stop()
      const tempfile = path.join(outdir, 'temp.txt')
      await next.patchFile(tempfile, 'test')
      await next.export()
      await expect(next.readFile(tempfile)).rejects.toThrowError()
    })

    const fileExist = async (file: string) =>
      next
        .readFile(file)
        .then(() => true)
        .catch(() => false)
    /*
    beforeAll(async () => {
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

    it('should honor exportTrailingSlash for 404 page', async () => {
      expect(await fileExist(path.join(outdir, '404/index.html'))).toBe(true)

      // we still output 404.html for backwards compat
      expect(await fileExist(path.join(outdir, '404.html'))).toBe(true)
    })

    it('should handle trailing slash in getStaticPaths', async () => {
      expect(await fileExist(path.join(outdir, 'gssp/foo/index.html'))).toBe(
        true
      )

      expect(await fileExist(path.join(outNoTrailSlash, 'gssp/foo.html'))).toBe(
        true
      )
    })

    it('should only output 404.html without exportTrailingSlash', async () => {
      expect(
        await fileExist(path.join(outNoTrailSlash, '404/index.html'))
      ).toBe(false)

      expect(await fileExist(path.join(outNoTrailSlash, '404.html'))).toBe(true)
    })

    it('should not duplicate /index with exportTrailingSlash', async () => {
      expect(await fileExist(path.join(outdir, 'index/index.html'))).toBe(false)

      expect(await fileExist(path.join(outdir, 'index.html'))).toBe(true)
    })
    */
  }
)
