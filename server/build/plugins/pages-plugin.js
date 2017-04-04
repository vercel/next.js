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
        const routeName = `/${pageName.replace(/[/\\]index$/, '')}`

        const content = page.source()
        const newContent = `
          var comp = ${content}
          NEXT_PAGE_LOADER.registerPage('${routeName}', null, comp.default)
        `
        // Replace the current asset
        // TODO: We need to move "client-bundles" back to "bundles" once we remove
        // all the JSON eval stuff
        delete compilation.assets[chunk.name]
        compilation.assets[`client-bundles/pages/${pageName}.js`] = {
          source: () => newContent,
          size: () => newContent.length
        }
      })
      callback()
    })
  }
}
