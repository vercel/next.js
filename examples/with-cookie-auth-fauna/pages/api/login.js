import { query as q } from 'faunadb'
import { serverClient, serializeFaunaCookie } from '../../utils/fauna-auth'

export default async (req, res) => {
  const { email, password } = await req.body

  try {
    if (!email || !password) {
      throw new Error('Email and password must be provided.')
    }

    const loginRes = await serverClient.query(
      q.Login(q.Match(q.Index('users_by_email'), email), {
        password,
      })
    )

    if (!loginRes.secret) {
      throw new Error('No secret present in login query response.')
    }

    const cookieSerialized = serializeFaunaCookie(loginRes.secret)

    res.setHeader('Set-Cookie', cookieSerialized)
    res.status(200).end()
  } catch (error) {
    res.status(400).send(error.message)
  }
}
