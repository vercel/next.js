'use strict'
const { Action, api } = require('actionhero')

module.exports = class CreateChatRoom extends Action {
  constructor () {
    super()
    this.name = 'render'
    this.description = 'I render the next.js react website'
  }

  async run (data) {
    data.toRender = false
    return api.next.render(data.connection)
  }
}
