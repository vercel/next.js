import cookiesMiddleware from 'utils/middleware/cookies'

const handler = async (req, res) => {
  // An undefined value will delete the cookie.
  // https://github.com/pillarjs/cookies#cookiesset-name--value---options--
  req.cookie.set('authExample', undefined)
  res.status(200).json({ status: true })
}

export default cookiesMiddleware(handler)
