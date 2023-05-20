import { NextApiRequest, NextApiResponse } from 'next'
import { serialize } from 'cookie'
import { COOKIE_NAME } from '../../lib'

export default async function logout(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).send({ message: 'Only POST requests allowed' })
  }

  const cookie = serialize(COOKIE_NAME, '', { maxAge: -1, path: '/' })

  res.setHeader('Set-Cookie', cookie)
  res.send({ success: true })
}
