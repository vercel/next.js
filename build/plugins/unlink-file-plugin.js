import { join } from 'path'
import promisify from '../../lib/promisify'
import fs from 'fs'
import { IS_BUNDLED_PAGE_REGEX } from '../../lib/constants'

const unlink = promisify(fs.unlink)

export default class UnlinkFilePlugin {
  constructor () {
    this.prevAssets = {}
  }

  apply (compiler) {
    compiler.plugin('after-emit', (compilation, callback) => {
      const removed = Object.keys(this.prevAssets)
        .filter((a) => IS_BUNDLED_PAGE_REGEX.test(a) && !compilation.assets[a])

      this.prevAssets = compilation.assets

      Promise.all(removed.map(async (f) => {
        const path = join(compiler.outputPath, f)
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
