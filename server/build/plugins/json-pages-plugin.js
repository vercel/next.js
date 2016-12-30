export default class JsonPagesPlugin {
  apply (compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      const pages = Object
        .keys(compilation.assets)
        .filter((filename) => /^bundles\/pages/.test(filename))

      pages.forEach((pageName) => {
        const page = compilation.assets[pageName]
        const content = page.source()
        const newContent = JSON.stringify({ component: content })
        page.source = () => newContent
        page.size = () => newContent.length
      })

      callback()
    })
  }
}
