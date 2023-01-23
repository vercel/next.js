import { startStaticServer } from 'next-test-utils'

export type Context = {
  appDir: string
  server: Awaited<ReturnType<typeof startStaticServer>>
  port: number
  serverNoTrailSlash: Awaited<ReturnType<typeof startStaticServer>>
  portNoTrailSlash: number
}
