export default class JsonPagesPlugin {
  apply (compiler) {
    compiler.plugin('after-compile', (compilation, callback) => {
      const pages = Object
        .keys(compilation.assets)
        .filter((filename) => /^bundles[/\\]pages.*\.js$/.test(filename))

      pages.forEach((pageName) => {
        const page = compilation.assets[pageName]
        // delete compilation.assets[pageName]

        const content = page.source()
        const newContent = JSON.stringify({ component: content })

        compilation.assets[`${pageName}on`] = {
          source: () => newContent,
          size: () => newContent.length
        }
      })

      callback()
    })
  }
}
