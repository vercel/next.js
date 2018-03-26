let host = process.env.REDIS_HOST || '127.0.0.1'
let port = process.env.REDIS_PORT || 6379
let db = process.env.REDIS_DB || 0
let password = process.env.REDIS_PASSWORD || null
const maxBackoff = 1000

if (process.env.REDIS_URL) {
  password = process.env.REDIS_URL.match(/redis:\/\/.*:(.*)@.*:\d*$/i)[1]
  host = process.env.REDIS_URL.match(/redis:\/\/.*:.*@(.*):\d*$/i)[1]
  port = parseInt(process.env.REDIS_URL.match(/redis:\/\/.*:.*@.*:(\d*)$/i)[1])
}

exports['default'] = {
  redis: (api) => {
    // konstructor: The redis client constructor method.  All redis methods must be promises
    // args: The arguments to pass to the constructor
    // buildNew: is it `new konstructor()` or just `konstructor()`?

    function retryStrategy (times) {
      if (times === 1) {
        const error = 'Unable to connect to Redis - please check your Redis config!'
        if (process.env.NODE_ENV === 'test') { console.error(error) } else { api.log(error, 'error') }
        return 5000
      }
      return Math.min(times * 50, maxBackoff)
    }

    return {
      enabled: true,

      '_toExpand': false,
      client: {
        konstructor: require('ioredis'),
        args: [{ port: port, host: host, password: password, db: db, retryStrategy: retryStrategy }],
        buildNew: true
      },
      subscriber: {
        konstructor: require('ioredis'),
        args: [{ port: port, host: host, password: password, db: db, retryStrategy: retryStrategy }],
        buildNew: true
      },
      tasks: {
        konstructor: require('ioredis'),
        args: [{ port: port, host: host, password: password, db: db, retryStrategy: retryStrategy }],
        buildNew: true
      }
    }
  }
}
