import { getSession } from '@auth0/nextjs-auth0'

// Serverless function
// Protected API, requests to '/api/protected' without a valid session cookie will fail

export default async function handle(req, res) {
  const session = getSession(req, res)

  if (!session) {
    res.status(401)
    res.json({
      error: 'not_authenticated',
      description:
        'The user does not have an active session or is not authenticated',
    })
    res.end()
  }

  try {
    res.status(200)
    res.json({
      session: 'true',
      id: session.user.sub,
      nickname: session.user.nickname,
    })
  } catch (e) {
    res.status(500)
    res.json({ error: 'Unable to fetch', description: e })
  }
}
