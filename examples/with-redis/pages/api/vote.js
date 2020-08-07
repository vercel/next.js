import redis from 'redis'
import { promisify } from 'util'

export default async function list(req, res) {
  const client = redis.createClient({
    url: process.env.REDIS_URL,
  })
  client.on('error', function (err) {
    throw err
  })

  const body = req.body
  const id = body['id']
  let ip = req.headers['x-forwarded-for']
  const saddAsync = promisify(client.sadd).bind(client)
  let c = await saddAsync('s:' + id, ip ? ip : '-')
  if (c === 0) {
    client.quit()
    res.json({
      error: 'You can not vote an item multiple times',
    })
  } else {
    const zincrbyAsync = promisify(client.zincrby).bind(client)
    let v = await zincrbyAsync('roadmap', 1, id)
    client.quit()
    res.json({
      body: v,
    })
  }
}
