import fetch from 'isomorphic-unfetch'
import cookie from 'cookie'

const url = `https://${process.env.AUTH0_DOMAIN}/v2/logout`

export default async (req, res) => {
  try {
    const response = await fetch(url)

    if (response.ok) {
      res.setHeader(
        'Set-Cookie',
        cookie.serialize('access_token', '', { maxAge: 0, path: '/' })
      )
      res.statusCode = 200
      res.json({ done: true })
    } else {
      const error = new Error(response.statusText)
      error.status = response.status
      throw error
    }
  } catch (error) {
    console.error(error)
    res.status(error.status || 500).end(error.message)
  }
}
