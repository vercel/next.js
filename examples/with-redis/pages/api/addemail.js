import { getRedis } from './utils'

module.exports = async (req, res) => {
  let redis = getRedis()

  const body = req.body
  const email = body['email']

  redis.on('error', function (err) {
    throw err
  })

  if (email && validateEmail(email)) {
    await redis.sadd('emails', email)
    redis.quit()
    res.json({
      body: 'success',
    })
  } else {
    redis.quit()
    res.json({
      error: 'Invalid email',
    })
  }
}

function validateEmail(email) {
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return re.test(String(email).toLowerCase())
}
