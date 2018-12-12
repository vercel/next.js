const { send } = require('micro')

const index = async (req, res) => {
  send(res, 200, '<h1>Hello from Micro on Now 2.0!</h2>')
}

module.exports = index
