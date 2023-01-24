import type { Server } from 'net'

export type Context = {
  server: Server
  port: number
  serverNoTrailSlash: Server
  portNoTrailSlash: number
}
