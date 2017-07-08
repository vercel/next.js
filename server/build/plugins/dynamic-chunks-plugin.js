import { ConcatSource } from 'webpack-sources'

export default class DynamicChunksPlugin {
  apply (compiler) {
    const isImportChunk = /^chunks[/\\].*\.js$/
    const matchChunkName = /^chunks[/\\](.*)$/

    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('optimize-chunk-assets', (chunks, callback) => {
        chunks = chunks.filter(chunk => isImportChunk.test(chunk.name))

        chunks.forEach((chunk) => {
          const asset = compilation.assets[chunk.name]
          if (!asset) return

          const chunkName = matchChunkName.exec(chunk.name)[1]
          const concat = new ConcatSource()

          concat.add(`__NEXT_REGISTER_CHUNK('${chunkName}', function() {
          `)
          concat.add(asset)
          concat.add(`
            })
          `)

          // Replace the exisiting chunk with the new content
          compilation.assets[chunk.name] = concat

          // This is to support, webpack dynamic import support with HMR
          compilation.assets[`chunks/${chunk.name}`] = concat
        })

        callback()
      })
    })
  }
}
