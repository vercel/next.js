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
        const page = compilation.assets[chunk.name]
        const pageName = matchRouteName.exec(chunk.name)[1]
        const routeName = `/${pageName.replace(/[/\\]?index$/, '')}`

        const content = page.source()
        const newContent = `
          function loadPage () {
            var comp = ${content}
            window.__NEXT_PAGE_LOADER__.registerPage('${routeName}', null, comp.default)
          }

          if (window.__NEXT_PAGE_LOADER__) {
            loadPage()
          } else {
            window.__NEXT_LOADED_PAGES__ = window.__NEXT_LOADED_PAGES__ || []
            window.__NEXT_LOADED_PAGES__.push(loadPage)
          }
        `
        // Replace the exisiting chunk with the new content
        compilation.assets[chunk.name] = {
          source: () => newContent,
          size: () => newContent.length
        }
      })
      callback()
    })
  }
}
