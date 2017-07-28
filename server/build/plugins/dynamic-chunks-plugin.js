import { ConcatSource } from 'webpack-sources'

const isImportChunk = /^chunks[/\\].*\.js$/
const matchChunkName = /^chunks[/\\](.*)$/

class DynamicChunkTemplatePlugin {
  apply (chunkTemplate) {
    chunkTemplate.plugin('render', function (modules, chunk) {
      if (!isImportChunk.test(chunk.name)) {
        return modules
      }

      const chunkName = matchChunkName.exec(chunk.name)[1]
      const source = new ConcatSource()

      source.add(`
        __NEXT_REGISTER_CHUNK('${chunkName}', function() {
      `)
      source.add(modules)
      source.add(`
        })
      `)

      return source
    })
  }
}

export default class DynamicChunksPlugin {
  apply (compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.chunkTemplate.apply(new DynamicChunkTemplatePlugin())
    })
  }
}
