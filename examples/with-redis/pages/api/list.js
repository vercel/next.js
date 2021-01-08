import redis from 'redis'
import { promisify } from 'util'

export default async function list(req, res) {
  const client = redis.createClient({
    url: process.env.REDIS_URL,
  })
  const hgetallAsync = promisify(client.hgetall).bind(client)
  const zrevrangeAsync = promisify(client.zrevrange).bind(client)

  let n = await zrevrangeAsync('roadmap', 0, 50, 'WITHSCORES')
  let result = []
  const promises = []
  for (let i = 0; i < n.length - 1; i += 2) {
    let id = n[i]
    let p = hgetallAsync(id).then((item) => {
      if (item) {
        item['id'] = id
        item['score'] = n[i + 1]
        result.push(item)
      }
    })
    promises.push(p)
  }

  await Promise.all(promises).then(() => {
    client.quit()
  })

  res.json({
    body: result,
  })
}
