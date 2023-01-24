import type { Server } from 'net'
import type { NextInstance } from 'e2e-utils'

export type Context = {
  next: NextInstance
  server: Server
  serverNoTrailSlash: Server
}
