import type { AdapterOptions } from '../../server/web/adapter'

import '../../server/web/globals'

import { adapter } from '../../server/web/adapter'

// Import the userland code.
import * as _mod from 'VAR_USERLAND'
import { edgeInstrumentationOnRequestError } from '../../server/web/globals'

const mod = { ..._mod }
const handler = mod.middleware || mod.default

const page = 'VAR_DEFINITION_PAGE'

if (typeof handler !== 'function') {
  throw new Error(
    `The Middleware "${page}" must export a \`middleware\` or a \`default\` function`
  )
}

// Middleware will only sent out the FetchEvent to next server,
// so load instrumentation module here and track the error inside middleware module.
function errorHandledHandler(fn: AdapterOptions['handler']) {
  return async (...args: Parameters<AdapterOptions['handler']>) => {
    try {
      return await fn(...args)
    } catch (err) {
      const req = args[0]
      await edgeInstrumentationOnRequestError(
        err,
        {
          url: req.url,
          method: req.method,
          headers: Object.fromEntries(req.headers.entries()),
        },
        {
          routerKind: 'Pages Router',
          routePath: '/middleware',
          routeType: 'middleware',
        }
      )

      throw err
    }
  }
}

export default function nHandler(
  opts: Omit<AdapterOptions, 'IncrementalCache' | 'page' | 'handler'>
) {
  return adapter({
    ...opts,
    page,
    handler: errorHandledHandler(handler),
  })
}
