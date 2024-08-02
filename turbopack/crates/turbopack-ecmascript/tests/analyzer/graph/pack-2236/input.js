import 'server-only'

import { Redis as UpstashRedis } from '@upstash/redis'

const Redis =
  typeof EdgeRuntime === 'undefined' ? require('ioredis') : UpstashRedis
