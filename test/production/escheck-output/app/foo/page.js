'use client'

const queue = {
  delete(value) {
    return value
  },
}

globalThis.__turbopackEsCheckQueue = queue

import('./dynamic').then(function (module) {
  globalThis.__turbopackEsCheckDynamic = module.default
})

export default function Page() {
  return <button>Client</button>
}
