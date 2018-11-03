const { Controller } = require('egg')

class PagesController extends Controller {
  async index() {
    return this.ctx.renderjsx({
      pathname: '/index',
      query: {
        test: 'index'
      }
    })
  }

  async demo() {
    return this.ctx.renderjsx({
      pathname: '/demo',
      query: {
        test: 'demo'
      }
    })
  }
}

module.exports = PagesController
