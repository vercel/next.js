declare const NAME: string
declare const PAGE: string

import { adapter, enhanceGlobals } from 'next/dist/server/web/adapter'

enhanceGlobals()

var mod = require('ENTRY')
var handler = mod.middleware || mod.default

if (typeof handler !== 'function') {
  throw new Error(
    `The Edge Function "pages/${PAGE}" must export a \`default\` function`
  )
}

// @ts-ignore
globalThis._ENTRIES = {
  [`middleware_${NAME}`]: {
    default: function (opts: any) {
      return adapter({
        ...opts,
        page: `/${PAGE}`,
        handler,
      })
    },
  },
}
