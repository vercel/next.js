import { OAuth2Client } from 'google-auth-library'

const posts = [
  {
    id: 1,
    title: 'My first blog post',
  },
  {
    id: 2,
    title: 'Another blog post',
  },
  {
    id: 3,
    title: 'My final blog post',
  },
]

async function verifyUser(client, token) {
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.google_client_id,
  })
  const payload = ticket.getPayload()
  const email = payload['email']
  return email
}

export default (req, res) => {
  const client = new OAuth2Client(process.env.google_client_id)
  console.log(req.headers)

  const token = req.headers.authorization.split('Bearer ')[1]
  if (!token) res.status(401).end()

  try {
    // here you could return the user's email and make a database query based on the user's email to retrieve posts:
    verifyUser(client, token)
    res.status(200).json(posts)
  } catch (e) {
    console.error(e)
  }
}
