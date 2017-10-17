import Concat from 'concat-with-sourcemaps'

export default class DynamicChunksPlugin {
  apply (compiler) {
    const isImportChunk = /^chunks[/\\].*\.js$/
    const matchChunkName = /^chunks[/\\](.*)$/

    compiler.plugin('after-compile', (compilation, callback) => {
      const chunks = Object
        .keys(compilation.namedChunks)
        .map(key => compilation.namedChunks[key])
        .filter(chunk => isImportChunk.test(chunk.name))

      chunks.forEach((chunk) => {
        const asset = compilation.assets[chunk.name]
        const sourceMap = compilation.assets[`${chunk.name}.map`]
        if (!asset) return

        const chunkName = matchChunkName.exec(chunk.name)[1]
        const concat = new Concat(true, chunk.name, '\n')

        concat.add(null, `
          window.__NEXT_REGISTER_CHUNK('${chunkName}', function() {
        `)
        concat.add(chunk.name, asset.source(), sourceMap && sourceMap.source())
        concat.add(null, `
          })
        `)
        concat.add(null, `//# sourceMappingURL=${chunk.name}.map\n`)

        // Replace the exisiting chunk with the new content
        compilation.assets[chunk.name] = {
          size: () => concat.content.length,
          source: () => concat.content
        }
        compilation.assets[`${chunk.name}.map`] = {
          size: () => concat.sourceMap.length,
          source: () => concat.sourceMap
        }

        // This is to support, webpack dynamic import support with HMR
        compilation.assets[`chunks/${chunk.name}`] = {
          size: () => concat.content.length,
          source: () => concat.content
        }
        compilation.assets[`chunks/${chunk.name}.map`] = {
          size: () => concat.sourceMap.length,
          source: () => concat.sourceMap
        }
      })
      callback()
    })
  }
}
