import fetch from 'isomorphic-unfetch'

export default async (req, res) => {
  if (!('authorization' in req.headers)) {
    return res.status(401).send('Authorization header missing')
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
      return res.status(200).json({ data })
    } else {
      return res.status(response.status).send(response.statusText)
    }
  } catch ({ statusText, statusCode }) {
    const err = new Error(statusText)
    err.statusCode = statusCode
    return err
  }
}
