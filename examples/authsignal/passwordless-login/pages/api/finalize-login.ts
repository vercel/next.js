import { NextApiRequest, NextApiResponse } from 'next'
import { authsignal, createCookieForSession } from '../../lib'

// This route handles the redirect back from the Authsignal Prebuilt MFA page
export default async function finalizeLogin(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only GET requests since we are handling redirects
  if (req.method !== 'GET') {
    return res.status(405).send({ message: 'Only GET requests allowed' })
  }

  const token = req.query.token as string

  // This step uses your secret key to validate the token returned via the redirect
  // It makes an authenticated call to Authsignal to check if the magic link challenge succeeded
  const { success, user } = await authsignal.validateChallenge({ token })

  if (success) {
    const cookie = await createCookieForSession(user)

    res.setHeader('Set-Cookie', cookie)
  }

  res.redirect('/')
}
