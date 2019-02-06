const { send, createError, run } = require('micro')
const fetch = require('isomorphic-unfetch')

const profile = async (req, res) => {
  if (!('authorization' in req.headers)) {
    throw createError(401, 'Authorization header missing')
  }

  const auth = await req.headers.authorization
  const { token } = JSON.parse(auth)
  const url = `https://api.github.com/user/${token}`

  try {
    const response = await fetch(url)

    if (response.ok) {
      const js = await response.json()
      // Need camelcase in the frontend
      const data = Object.assign({}, { avatarUrl: js.avatar_url }, js)
      send(res, 200, { data })
    } else {
      send(res, response.status, response.statusText)
    }
  } catch (error) {
    throw createError(error.statusCode, error.statusText)
  }
}

module.exports = (req, res) => run(req, res, profile)
