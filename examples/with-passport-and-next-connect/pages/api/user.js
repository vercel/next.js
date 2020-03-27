import nextConnect from 'next-connect'
import auth from '../../middleware/auth'

const handler = nextConnect()
handler.use(auth).get((req, res) => {
  res.json({ user: req.user })
})

export default handler
