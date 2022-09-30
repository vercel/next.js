import Redis from 'ioredis'

function fixUrl(url) {
  if (!url) {
    return ''
  }
  if (url.startsWith('redis://') && !url.startsWith('redis://:')) {
    return url.replace('redis://', 'redis://:')
  }
  if (url.startsWith('rediss://') && !url.startsWith('rediss://:')) {
    return url.replace('rediss://', 'rediss://:')
  }
  return url
}

class ClientRedis {
  constructor() {
    throw new Error('Use Singleton.getInstance()')
  }

  static getInstance() {
    if (!ClientRedis.instance) {
      ClientRedis.instance = new Redis(fixUrl(process.env.REDIS_URL))
    }
    return ClientRedis.instance
  }
}

const redis = ClientRedis.getInstance()

export default redis
