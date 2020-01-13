import { query as q } from 'faunadb'
import { serverClient, serializeFaunaCookie } from '../../utils/fauna-auth'

export default async (req, res) => {
  const { email, password } = await req.body

  try {
    if (!email || !password) {
      throw new Error('Email and password must be provided.')
    }
    console.log(`email: ${email} trying to create user.`)
    let createRes
    try {
      createRes = await serverClient.query(
        q.Create(q.Collection('User'), {
          credentials: { password },
          data: { email },
        })
      )
    } catch (err) {
      console.error('ERR', err)
      throw new Error('User already exists.')
    }
    if (!createRes.ref) {
      throw new Error('No ref present in create query response.')
    }
    const loginRes = await serverClient.query(
      q.Login(createRes.ref, {
        password,
      })
    )
    if (!loginRes.secret) {
      throw new Error('No secret present in login query response.')
    }
    var cookieSerialized = serializeFaunaCookie(loginRes.secret)
    res.setHeader('Set-Cookie', cookieSerialized)
    res.status(200).json({ email })
  } catch (error) {
    const { response } = error
    return response
      ? res.status(response.status).json({ message: response.statusText })
      : res.status(400).json({ message: error.message })
  }
}
