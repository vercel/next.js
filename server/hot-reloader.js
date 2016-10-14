import WebpackDevServer from 'webpack-dev-server'

export default class HotReloader {
  constructor (compiler) {
    this.server = new WebpackDevServer(compiler, {
      publicPath: '/',
      hot: true,
      noInfo: true,
      clientLogLevel: 'warning'
    })
  }

  async start () {
    await this.waitBuild()
    await this.listen()
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
