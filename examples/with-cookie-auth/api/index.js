const { send } = require('micro')
const login = require('./login')
const profile = require('./profile')

const dev = async (req, res) => {
  switch (req.url) {
    case '/api/profile.js':
      await profile(req, res)
      break
    case '/api/login.js':
      await login(req, res)
      break

    default:
      send(res, 404, '404. Not found.')
      break
  }
}

module.exports = dev
