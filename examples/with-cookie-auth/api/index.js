const { run, send } = require('micro')
const { login } = require('./login')
const { profile } = require('./profile')

const dev = async (req, res) => {
  switch (req.url) {
    case '/api/profile.js':
      send(res, 200, await profile(req, res))
      break
    case '/api/login.js':
      send(res, 200, await login(req, res))
      break

    default:
      send(res, 404, '404. Not found.')
      break
  }
}

exports.default = (req, res) => run(req, res, dev)
