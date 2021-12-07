// This API route authenticates a Stytch magic link.
import type { NextApiRequest, NextApiResponse } from 'next'
import { Session } from 'next-iron-session'
import withSession from '../../lib/withSession'
import loadStytch from '../../lib/loadStytch'
type NextIronRequest = NextApiRequest & { session: Session }

type Data = {
  errorString: string
}

export async function handler(
  req: NextIronRequest,
  res: NextApiResponse<Data>
) {
  if (req.method === 'GET') {
    const client = loadStytch()
    const { token } = req.query
    try {
      const resp = await client.magicLinks.authenticate(token as string)
      // Set session
      req.session.destroy()
      req.session.set('user', {
        id: resp.user_id,
      })
      // Save additional user data here
      await req.session.save()
      res.redirect('/profile')
    } catch (error) {
      const errorString = JSON.stringify(error)
      console.log(error)
      res.status(400).json({ errorString })
    }
  } else {
    // Handle any other HTTP method
  }
}

export default withSession(handler)
