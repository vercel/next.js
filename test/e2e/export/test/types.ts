import type { Server } from 'net'

export type Context = {
  appDir: string
  server: Server
  port: number
  serverNoTrailSlash: Server
  portNoTrailSlash: number
}
