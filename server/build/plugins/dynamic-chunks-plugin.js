import { ConcatSource } from 'webpack-sources'

const isImportChunk = /^chunks[/\\].*\.js$/
const matchChunkName = /^chunks[/\\](.*)$/

export default class DynamicChunksPlugin {
  apply (compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('additional-chunk-assets', (chunks) => {
        chunks = chunks.filter(chunk =>
          isImportChunk.test(chunk.name) && compilation.assets[chunk.name]
        )

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
          const copyFilename = `chunks/${chunk.name}`
          compilation.additionalChunkAssets.push(copyFilename)
          compilation.assets[copyFilename] = compilation.assets[chunk.name]
        })
      })
    })
  }
}
