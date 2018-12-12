const { json, send, createError, run } = require('micro')
const fetch = require('isomorphic-unfetch')

const login = async (req, res) => {
  const { username } = await json(req)
  const url = `https://api.github.com/users/${username}`

  try {
    const response = await fetch(url)
    if (response.ok) {
      const { id } = await response.json()
      send(res, 200, { token: id })
    } else {
      send(res, response.status, response.statusText)
    }
  } catch (error) {
    throw createError(error.statusCode, error.statusText)
  }
}

module.exports = (req, res) => run(req, res, login)
