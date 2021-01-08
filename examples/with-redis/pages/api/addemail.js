import redis from 'redis'
import { promisify } from 'util'

export default async function addEmail(req, res) {
  const client = redis.createClient({
    url: process.env.REDIS_URL,
  })
  const saddAsync = promisify(client.sadd).bind(client)

  const body = req.body
  const email = body['email']

  client.on('error', function (err) {
    throw err
  })

  if (email && validateEmail(email)) {
    await saddAsync('emails', email)
    client.quit()
    res.json({
      body: 'success',
    })
  } else {
    client.quit()
    res.json({
      error: 'Invalid email',
    })
  }
}

function validateEmail(email) {
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return re.test(String(email).toLowerCase())
}
