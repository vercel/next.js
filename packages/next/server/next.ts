import Server, { ServerConstructor } from '../next-server/server/next-server'

type NextServerConstructor = Omit<ServerConstructor, 'staticMarkup'> & {
  /**
   * Whether to launch Next.js in dev mode - @default false
   */
  dev?: boolean
}

// This file is used for when users run `require('next')`
function createServer(options: NextServerConstructor): Server {
  if (options.dev) {
    const Server = require('./next-dev-server').default
    return new Server(options)
  }

  return new Server(options)
}

// Support commonjs `require('next')`
module.exports = createServer
exports = module.exports

// Support `import next from 'next'`
export default createServer
