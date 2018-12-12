const { send, run } = require('micro')

const index = async (req, res) => {
  send(res, 200, '<h1>Hello from Express on Now 2.0!</h2>')
}

module.exports = (req, res) => run(req, res, index)
