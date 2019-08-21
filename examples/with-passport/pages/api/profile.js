import fetch from 'isomorphic-unfetch'
import { authenticate } from '../../lib/passport/jwt'

const parseUser = data => ({
  username: data.login,
  name: data.name,
  avatarUrl: data.avatar_url,
  bio: data.bio
})

export default async (req, res) => {
  try {
    const payload = await authenticate(req)
    const url = `https://api.github.com/users/${payload.username}`
    const response = await fetch(url)

    if (response.ok) {
      const data = await response.json()
      res.status(200).json(parseUser(data))
    } else {
      const error = new Error(response.statusText)
      error.status = response.status
      throw error
    }
  } catch (error) {
    console.error(error)
    res.status(error.status || 400).end(error.message)
  }
}
