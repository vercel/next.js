import { join } from 'path'
import { promises } from 'fs'
import { Compiler } from 'webpack'
import getRouteFromEntrypoint from '../../../next-server/server/get-route-from-entrypoint'
// Makes sure removed pages are removed from `.next` in development
export class UnlinkRemovedPagesPlugin {
  prevAssets: any
  constructor() {
    this.prevAssets = {}
  }

  apply(compiler: Compiler) {
    compiler.hooks.afterEmit.tapAsync(
      'NextJsUnlinkRemovedPages',
      (compilation, callback) => {
        const removed = Object.keys(this.prevAssets).filter(
          (a) => getRouteFromEntrypoint(a) && !compilation.assets[a]
        )

        this.prevAssets = compilation.assets

        Promise.all(
          removed.map(async (f) => {
            const path = join((compiler as any).outputPath, f)
            try {
              await promises.unlink(path)
            } catch (err) {
              if (err.code === 'ENOENT') return
              throw err
            }
          })
        ).then(() => callback(), callback)
      }
    )
  }
}
