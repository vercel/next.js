const { json, send, createError } = require('micro')
const fetch = require('isomorphic-unfetch')

const login = async (req, res) => {
  const { username } = await json(req)
  const url = `https://api.github.com/users/${username}`

  console.log(url)

  try {
    const response = await fetch(url)
    if (response.ok) {
      const js = await response.json()
      send(res, 200, js)
    } else {
      send(res, response.status, response.statusText)
    }
  } catch (error) {
    throw createError(error.statusCode, error.statusText)
  }
}

module.exports = login
