import Server, { ServerConstructor } from '../next-server/server/next-server'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import * as log from '../build/output/log'

type NextServerConstructor = ServerConstructor & {
  /**
   * Whether to launch Next.js in dev mode - @default false
   */
  dev?: boolean
}

// This file is used for when users run `require('next')`
function createServer(options: NextServerConstructor): Server {
  const standardEnv = ['production', 'development', 'test']

  if (options == null) {
    throw new Error(
      'The server has not been instantiated properly. https://err.sh/next.js/invalid-server-options'
    )
  }

  if (
    !(options as any).isNextDevCommand &&
    process.env.NODE_ENV &&
    !standardEnv.includes(process.env.NODE_ENV)
  ) {
    log.warn(NON_STANDARD_NODE_ENV)
  }

  if (options.dev) {
    if (typeof options.dev !== 'boolean') {
      console.warn(
        "Warning: 'dev' is not a boolean which could introduce unexpected behavior. https://err.sh/next.js/invalid-server-options"
      )
    }

    const DevServer = require('./next-dev-server').default
    return new DevServer(options)
  }

  return new Server(options)
}

// Support commonjs `require('next')`
module.exports = createServer
exports = module.exports

// Support `import next from 'next'`
export default createServer
