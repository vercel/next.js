// This API route authenticates Stytch OTP codes.
import type { NextApiRequest, NextApiResponse } from 'next'
import { Session } from 'next-iron-session'
import withSession from '../../lib/withSession'
import loadStytch from '../../lib/loadStytch'
type NextIronRequest = NextApiRequest & { session: Session }

type Data = {
  msg: string
}

export async function handler(
  req: NextIronRequest,
  res: NextApiResponse<Data>
) {
  if (req.method === 'POST') {
    const client = loadStytch()
    const data = JSON.parse(req.body)
    try {
      // params are of type stytch.LoginOrCreateUserBySMSRequest
      const params = {
        code: data.otpInput,
        method_id: data.methodId,
      }

      const resp = await client.otps.authenticate(params)
      if (resp.status_code.toString() === '200') {
        // Set session
        req.session.destroy()
        // Save additional user data here
        req.session.set('user', {
          id: resp.user_id,
        })
        await req.session.save()
        res
          .status(200)
          .send({ msg: `successfully authenticated ${resp.user_id}` })
      } else {
        throw Error('Error authenticating your code')
      }
    } catch (error) {
      const errorString = JSON.stringify(error)
      console.log(error)
      res.status(400).json({ msg: errorString })
    }
  } else {
    // Handle any other HTTP method
  }
}

export default withSession(handler)
