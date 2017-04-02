export default class PagesPlugin {
  apply (compiler) {
    const isBundledPage = /^bundles[/\\]pages.*\.js$/
    const matchRouteName = /^bundles[/\\]pages[/\\](.*)\.js$/
    compiler.plugin('after-compile', (compilation, callback) => {
      const pages = Object
        .keys(compilation.namedChunks)
        .map(key => compilation.namedChunks[key])
        .filter(chunk => isBundledPage.test(chunk.name))

      pages.forEach((chunk) => {
        const {name: pageName, entryModule: {id}} = chunk
        const page = compilation.assets[pageName]
        delete compilation.assets[pageName]
        const routeName = matchRouteName.exec(pageName)[1]
        const content = page.source()
        const newContent = `(
        function(pageLoader) {
          ${content}
          pageLoader.registerPage('${routeName}',webpackJsonp([],[],[${id}]).default)
        })(__NEXT_DATA__.pageLoader)`

        compilation.assets[pageName] = {
          source: () => newContent,
          size: () => newContent.length
        }
      })
      callback()
    })
  }
}
