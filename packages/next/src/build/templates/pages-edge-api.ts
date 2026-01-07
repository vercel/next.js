import type { EdgeHandler } from '../../server/web/adapter'

import '../../server/web/globals'

import { adapter } from '../../server/web/adapter'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { wrapApiHandler } from '../../server/api-utils'

// Import the userland code.
import handlerUserland from 'VAR_USERLAND'

const page = 'VAR_DEFINITION_PAGE'

if (typeof handlerUserland !== 'function') {
  throw new Error(
    `The Edge Function "pages${page}" must export a \`default\` function`
  )
}

const handler: EdgeHandler = (opts) => {
  return adapter({
    ...opts,
    IncrementalCache,
    page: 'VAR_DEFINITION_PATHNAME',
    handler: wrapApiHandler(page, handlerUserland),
  })
}
export default handler
