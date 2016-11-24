import http from 'http'
import next from './next'

export default class Server {
  constructor (dir, opts) {
    this.app = next(dir, opts)
    this.http = http.createServer(this.app.getRequestHandler())
  }

  async start (port) {
    await this.app.prepare()
    await new Promise((resolve, reject) => {
      this.http.listen(port, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }
}
