import { withSession } from '@clerk/nextjs/api'

export default withSession((req, res) => {
  res.statusCode = 200
  if (req.session) {
    res.json({ id: req.session.userId })
  } else {
    res.json({ id: null })
  }
})
