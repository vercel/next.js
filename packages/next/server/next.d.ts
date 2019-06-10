import Server from 'next-server/dist/server/next-server'

interface DevServer extends Server {
  renderOpts: Server['renderOpts'] & { dev: true }
}

declare function next(options: any): Server
declare function next(options: any & { dev: true }): DevServer

export default next
