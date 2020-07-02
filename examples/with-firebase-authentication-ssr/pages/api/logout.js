import cookiesMiddleware from 'utils/middleware/cookies'

const handler = async (req, res) => {
  // Destroy the session.
  // https://github.com/expressjs/cookie-session#destroying-a-session
  req.session = null
  res.status(200).json({ status: true })
}

export default cookiesMiddleware(handler)
