import { CacheFs } from '../../../shared/lib/utils'
import path from 'path'
import type { CacheHandler, CacheHandlerContext } from './'

export default class FileSystemCache implements CacheHandler {
  private flushToDisk?: boolean
  private pagesDir: string
  private fs: CacheFs

  constructor(ctx: CacheHandlerContext) {
    this.flushToDisk = ctx.flushToDisk
    this.pagesDir = ctx.pagesDir
    this.fs = ctx.fs
  }

  public async get(key: string) {
    return this.fs.readFile(this.getSeedPath(key))
  }
  public async getMeta(key: string) {
    const stat = await this.fs.stat(this.getSeedPath(key))
    return {
      mtime: stat.mtime.getTime(),
    }
  }

  public async set(key: string, data: string) {
    if (!this.flushToDisk) return
    const pathname = this.getSeedPath(key)
    await this.fs.mkdir(path.dirname(pathname))
    return this.fs.writeFile(pathname, data)
  }

  private getSeedPath(pathname: string): string {
    return path.join(this.pagesDir, pathname)
  }
}
