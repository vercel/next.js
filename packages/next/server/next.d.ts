import Server, { ServerConstructor } from 'next-server/dist/server/next-server'

type NextServerConstructor = Omit<ServerConstructor, 'staticMarkup'> & {
  /**
   * Whether to launch Next.js in dev mode - @default false
   */
  dev?: boolean
}

declare function next(opts: NextServerConstructor): Server

export default next
