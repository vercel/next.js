/* eslint-disable no-magic-numbers */
const express = require('express')
const next = require('next')
const redis = require('redis')
const NextCache = require('next-redis-cache')

const client = redis.createClient()

const port = process.env.PORT || 3000
const development = process.env.NODE_ENV !== 'production'
const app = next({ dev: development })

const redisCache = new NextCache(client, app, {
  includes: ['/'],
  defaultExpire: 7200,
  prefix: '__SSR_NEXT_CACHE_EXAMPLE__',
})

app
  .prepare()
  .then(() => {
    const server = express()

    server.get('*', (request, response) =>
      redisCache.handler(request, response)
    )

    /* starting server */
    return server.listen(port, (error) => {
      if (error) throw error

      // eslint-disable-next-line no-console
      console.log(`> Ready on http://localhost:${port}`)
    })
  })
  .catch((error) => new Error("Server isn't responded", error))
