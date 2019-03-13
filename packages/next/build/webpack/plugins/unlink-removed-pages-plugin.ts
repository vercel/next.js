import { join } from 'path'
import { promisify } from 'util'
import fs from 'fs'
import { IS_BUNDLED_PAGE_REGEX } from 'next-server/constants'
import {Compiler} from 'webpack'

const unlink = promisify(fs.unlink)

// Makes sure removed pages are removed from `.next` in development
export class UnlinkRemovedPagesPlugin {
  prevAssets: any
  constructor () {
    this.prevAssets = {}
  }

  apply (compiler: Compiler) {
    compiler.hooks.afterEmit.tapAsync('NextJsUnlinkRemovedPages', (compilation, callback) => {
      const removed = Object.keys(this.prevAssets)
        .filter((a) => IS_BUNDLED_PAGE_REGEX.test(a) && !compilation.assets[a])

      this.prevAssets = compilation.assets

      Promise.all(removed.map(async (f) => {
        const path = join((compiler as any).outputPath, f)
        try {
          await unlink(path)
        } catch (err) {
          if (err.code === 'ENOENT') return
          throw err
        }
      }))
        .then(() => callback(), callback)
    })
  }
}
