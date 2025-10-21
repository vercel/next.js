import type { AdapterOptions } from '../../server/web/adapter'

import '../../server/web/globals'

import { adapter } from '../../server/web/adapter'

// Import the userland code.
import * as _mod from 'VAR_USERLAND'
import { edgeInstrumentationOnRequestError } from '../../server/web/globals'
import { isNextRouterError } from '../../client/components/is-next-router-error'

const mod = { ..._mod }

const page = 'VAR_DEFINITION_PAGE'
// Turbopack does not add a `./` prefix to the relative file path, but Webpack does.
const relativeFilePath = 'VAR_MODULE_RELATIVE_PATH'
// @ts-expect-error `page` will be replaced during build
const isProxy = page === '/proxy' || page === '/src/proxy'
const handler = (isProxy ? mod.proxy : mod.middleware) || mod.default

if (typeof handler !== 'function') {
  const fileName = isProxy ? 'proxy' : 'middleware'
  // Webpack starts the path with "." as relative, but Turbopack does not.
  const resolvedRelativeFilePath = relativeFilePath.startsWith('.')
    ? relativeFilePath
    : `./${relativeFilePath}`

  throw new Error(
    `The file "${resolvedRelativeFilePath}" must export a function, either as a default export or as a named "${fileName}" export.\n` +
      `This function is what Next.js runs for every request handled by this ${fileName === 'proxy' ? 'proxy (previously called middleware)' : 'middleware'}.\n\n` +
      `Why this happens:\n` +
      (isProxy
        ? "- You are migrating from `middleware` to `proxy`, but haven't updated the exported function.\n"
        : '') +
      `- The file exists but doesn't export a function.\n` +
      `- The export is not a function (e.g., an object or constant).\n` +
      `- There's a syntax error preventing the export from being recognized.\n\n` +
      `To fix it:\n` +
      `- Ensure this file has either a default or "${fileName}" function export.\n\n` +
      `Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
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

export default function nHandler(
  opts: Omit<AdapterOptions, 'IncrementalCache' | 'page' | 'handler'>
) {
  return adapter({
    ...opts,
    page,
    handler: errorHandledHandler(handler),
  })
}
