import { Compiler, Plugin } from 'webpack'
import { createHash } from 'crypto'

export class HashedChunkIdsPlugin implements Plugin {
  buildId: string

  constructor(buildId: string) {
    this.buildId = buildId
  }

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('HashedChunkIdsPlugin', compilation => {
      compilation.hooks.beforeChunkIds.tap('HashedChunkIdsPlugin', chunks => {
        for (const chunk of chunks) {
          if (chunk.id === null && chunk.name) {
            const id = chunk.name.replace(this.buildId, '')

            chunk.id = createHash('md4')
              .update(id)
              .digest('hex')
              .substr(0, 4)
            continue
          }

          const ids = [...chunk.modulesIterable]
            .map(m => m.id)
            .sort() as string[]

          const h = createHash('md4')
          ids.forEach(id => h.update(id))
          chunk.id = h.digest('hex').substr(0, 4)
        }
      })
    })
  }
}
