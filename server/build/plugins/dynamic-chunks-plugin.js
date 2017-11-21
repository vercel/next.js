export default class PagesPlugin {
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
        if (!asset) return

        const chunkName = matchChunkName.exec(chunk.name)[1]

        const content = asset.source()
        const newContent = `
          window.__NEXT_REGISTER_CHUNK('${chunkName}', function() {
            ${content}
          })
        `
        // Replace the exisiting chunk with the new content
        compilation.assets[chunk.name] = {
          source: () => newContent,
          size: () => newContent.length
        }

        // This is to support, webpack dynamic import support with HMR
        compilation.assets[`chunks/${chunk.id}`] = {
          source: () => newContent,
          size: () => newContent.length
        }
      })
      callback()
    })
  }
}
