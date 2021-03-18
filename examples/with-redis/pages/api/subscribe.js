import redis from '../../lib/redis'

export default async function upvote(req, res) {
  const { email } = req.body

  if (email && validateEmail(email)) {
    await redis.sadd('emails', email)
    res.status(201).json({
      body: 'success',
    })
  } else {
    res.status(400).json({
      error: 'Invalid email',
    })
  }
}

function validateEmail(email) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return re.test(String(email).toLowerCase())
}
