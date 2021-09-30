import { withApiAuthRequired, getSession } from '@auth0/nextjs-auth0'

async function handle(req, res) {
  const { user } = getSession(req, res)

  if (!user) {
    res.status(401)
  }

  try {
    res.status(200)
    res.json({
      session: 'true',
      id: user.sub,
      nickname: user.nickname,
    })
  } catch (e) {
    res.status(500)
    res.json({ error: 'Unable to fetch', description: e })
  }
}

// Serverless function
// Protected API, requests to '/api/protected' without a valid session cookie will fail
export default withApiAuthRequired(handle)
