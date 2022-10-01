import { NextApiRequest, NextApiResponse } from 'next'
import { authsignal } from '../../lib'

const redirectUrl =
  process.env.REDIRECT_URL ?? 'http://localhost:3000/api/finalize-login'

export default async function login(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send({ message: 'Only POST requests allowed' })
  }

  const { email } = req.body

  const { url } = await authsignal.loginWithEmail({ email, redirectUrl })

  res.redirect(303, url)
}
