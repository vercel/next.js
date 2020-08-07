import redis from 'redis'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'

export default async function create(req, res) {
  const client = redis.createClient({
    url: process.env.REDIS_URL,
  })
  const hsetAsync = promisify(client.hset).bind(client)
  const zaddAsync = promisify(client.zadd).bind(client)

  const body = req.body
  const title = body['title']
  const id = uuidv4()

  client.on('error', function (err) {
    throw err
  })

  if (title) {
    await zaddAsync('roadmap', 0, id)
    await hsetAsync(id, 'title', title)
    client.quit()
    res.json({
      body: 'success',
    })
  } else {
    client.quit()
    res.json({
      error: 'Feature can not be empty',
    })
  }
}
