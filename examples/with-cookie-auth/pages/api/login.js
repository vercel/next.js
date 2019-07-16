import fetch from 'isomorphic-unfetch'

export default async (req, res) => {
  const { username } = await req.body
  console.log('username', username)
  const url = `https://api.github.com/users/${username}`

  try {
    const response = await fetch(url)

    if (response.ok) {
      const { id } = await response.json()
      return res.status(200).json({ token: id })
    } else {
      return res.status(response.status).send(response.statusText)
    }
  } catch ({ statusText, statusCode }) {
    const err = new Error(statusText)
    err.statusCode = statusCode
    return err
  }
}
