import micro from 'micro'
import fetch from 'isomorphic-unfetch'

export default micro(async (req, res) => {
  const { username } = await micro.json(req)
  const url = `https://api.github.com/users/${username}`

  try {
    const response = await fetch(url)
    if (response.ok) {
      const { id } = await response.json()
      return micro.send(res, 200, { token: id })
    } else {
      return micro.send(res, response.status, response.statusText)
    }
  } catch (error) {
    micro.createError(error.statusCode, error.statusText)
  }
})
