export default class PagesPlugin {
  apply (compiler) {
    const isBundledPage = /^bundles[/\\]pages.*\.js$/
    compiler.plugin('after-compile', (compilation, callback) => {
      const pages = Object
        .keys(compilation.namedChunks)
        .map(key => compilation.namedChunks[key])
        .filter(chunk => isBundledPage.test(chunk.name))

      pages.forEach((chunk) => {
        const {name: pageName, entryModule: {id}} = chunk
        const page = compilation.assets[pageName]
        delete compilation.assets[pageName]

        const content = page.source()
        const newContent = `(
        function(nextData) {
          ${content}
          nextData['${pageName}'] = webpackJsonp([],[],[${id}]).default
          nextData.emitter.emit('page-loaded','${pageName}');
        })(__NEXT_DATA__)`

        compilation.assets[pageName] = {
          source: () => newContent,
          size: () => newContent.length
        }
      })
      callback()
    })
  }
}
