import Server, { ServerConstructor } from '../next-server/server/next-server'
import { NON_STANDARD_NODE_ENV } from '../lib/constants'
import * as log from '../build/output/log'

type NextServerConstructor = Omit<ServerConstructor, 'staticMarkup'> & {
  /**
   * Whether to launch Next.js in dev mode - @default false
   */
  dev?: boolean
}

// This file is used for when users run `require('next')`
function createServer(options: NextServerConstructor): Server {
  const standardEnv = ['production', 'development', 'test']

  if (typeof options === 'undefined') {
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
    // This is optional and not related to the issue, but I believe this PR can introduce a handy warning if the variable is not boolean
    if (typeof options.dev !== 'boolean') {
      console.warn(
        "Warning: 'dev' is not a boolean which could introduce unexpected behavior. https://err.sh/next.js/invalid-server-options"
      )
    }

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
