import WebpackDevServer from 'webpack-dev-server'
import webpack from './build/webpack'
import read from './read'

export default class HotReloader {
  constructor (dir) {
    this.dir = dir
    this.server = null
  }

  async start () {
    await this.prepareServer()
    await this.waitBuild()
    await this.listen()
  }

  async prepareServer () {
    const compiler = await webpack(this.dir, { hotReload: true })

    compiler.plugin('after-emit', (compilation, callback) => {
      const { assets } = compilation
      for (const f of Object.keys(assets)) {
        const source = assets[f]
        // delete updated file caches
        delete require.cache[source.existsAt]
        delete read.cache[source.existsAt]
      }
      callback()
    })

    this.server = new WebpackDevServer(compiler, {
      publicPath: '/',
      hot: true,
      noInfo: true,
      clientLogLevel: 'warning'
    })
  }

  async waitBuild () {
    const stats = await new Promise((resolve) => {
      this.server.middleware.waitUntilValid(resolve)
    })

    const jsonStats = stats.toJson()
    if (jsonStats.errors.length > 0) {
      const err = new Error(jsonStats.errors[0])
      err.errors = jsonStats.errors
      err.warnings = jsonStats.warnings
      throw err
    }
  }

  listen () {
    return new Promise((resolve, reject) => {
      this.server.listen(3030, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  get fileSystem () {
    return this.server.middleware.fileSystem
  }
}
