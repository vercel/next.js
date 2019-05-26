import micro from 'micro'
import fetch from 'isomorphic-unfetch'

export default micro(async (req, res) => {
  if (!('authorization' in req.headers)) {
    throw micro.createError(401, 'Authorization header mising')
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
      micro.send(res, 200, { data })
    } else {
      micro.send(res, response.status, response.statusText)
    }
  } catch (error) {
    throw micro.createError(error.statusCode, error.statusText)
  }
})
