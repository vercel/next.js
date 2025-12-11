import type { AdapterOptions, EdgeHandler } from '../../server/web/adapter'

import '../../server/web/globals'

import { adapter } from '../../server/web/adapter'

// Import the userland code.
import * as _mod from 'VAR_USERLAND'
import { edgeInstrumentationOnRequestError } from '../../server/web/globals'
import { isNextRouterError } from '../../client/components/is-next-router-error'

const mod = { ..._mod }

const page: string = 'VAR_DEFINITION_PAGE'
const isProxy = page === '/proxy' || page === '/src/proxy'
const handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default

class ProxyMissingExportError extends Error {
  constructor(message: string) {
    super(message)
    // Stack isn't useful here, remove it considering it spams logs during development.
    this.stack = ''
  }
}

// TODO: This spams logs during development. Find a better way to handle this.
// Removing this will spam "fn is not a function" logs which is worse.
if (typeof handlerUserland !== 'function') {
  throw new ProxyMissingExportError(
    `The ${isProxy ? 'Proxy' : 'Middleware'} file "${page}" must export a function named \`${isProxy ? 'proxy' : 'middleware'}\` or a default function.`
  )
}

// Proxy will only sent out the FetchEvent to next server,
// so load instrumentation module here and track the error inside proxy module.
function errorHandledHandler(fn: AdapterOptions['handler']) {
  return async (...args: Parameters<AdapterOptions['handler']>) => {
    try {
      return await fn(...args)
    } catch (err) {
      // In development, error the navigation API usage in runtime,
      // since it's not allowed to be used in proxy as it's outside of react component tree.
      if (process.env.NODE_ENV !== 'production') {
        if (isNextRouterError(err)) {
          err.message = `Next.js navigation API is not allowed to be used in ${isProxy ? 'Proxy' : 'Middleware'}.`
          throw err
        }
      }
      const req = args[0]
      const url = new URL(req.url)
      const resource = url.pathname + url.search
      await edgeInstrumentationOnRequestError(
        err,
        {
          path: resource,
          method: req.method,
          headers: Object.fromEntries(req.headers.entries()),
        },
        {
          routerKind: 'Pages Router',
          routePath: '/proxy',
          routeType: 'proxy',
          revalidateReason: undefined,
        }
      )

      throw err
    }
  }
}

const handler: EdgeHandler = (opts) => {
  return adapter({
    ...opts,
    page,
    handler: errorHandledHandler(handlerUserland),
  })
}
export default handler
