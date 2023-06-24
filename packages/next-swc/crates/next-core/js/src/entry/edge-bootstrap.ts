import 'next/dist/server/web/globals'
import { adapter } from 'next/dist/server/web/adapter'
import { NAME, PAGE } from 'BOOTSTRAP_CONFIG'

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
