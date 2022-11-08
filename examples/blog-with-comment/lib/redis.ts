import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export default redis
