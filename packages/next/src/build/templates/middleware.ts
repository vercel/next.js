import type { AdapterOptions } from '../../server/web/adapter'

import '../../server/web/globals'

import { adapter } from '../../server/web/adapter'

// Import the userland code.
import * as _mod from 'VAR_USERLAND'

const mod = { ..._mod }
const handler = mod.middleware || mod.default

const page = 'VAR_DEFINITION_PAGE'

if (typeof handler !== 'function') {
  throw new Error(
    `The Middleware "${page}" must export a \`middleware\` or a \`default\` function`
  )
}

export default function nHandler(
  opts: Omit<AdapterOptions, 'IncrementalCache' | 'page' | 'handler'>
) {
  return adapter({
    ...opts,
    page,
    handler,
  })
}
