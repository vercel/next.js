import getConfig from '../../config'

export default class JsonPagesPlugin {
  constructor (dir) {
    this.config = getConfig(dir)
  }

  apply (compiler) {
    compiler.plugin('after-compile', (compilation, callback) => {
      const regex = new RegExp(`^bundles/${this.config.pagesDirectory}.*.js$`)
      const pages = Object
        .keys(compilation.assets)
        .filter((filename) => {
          return filename.match(regex)
        })

      pages.forEach((pageName) => {
        const page = compilation.assets[pageName]
        delete compilation.assets[pageName]

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
