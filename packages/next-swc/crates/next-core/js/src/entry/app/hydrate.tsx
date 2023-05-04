import { initializeHMR } from '@vercel/turbopack-next/dev/client'
import { hydrate } from 'next/dist/client/app-index'
import { version } from 'next/package.json'

initializeHMR({
  assetPrefix: '',
})

window.next = {
  version: `${version}-turbo`,
  appDir: true,
}

globalThis.__next_require__ = (data) => {
  const [client_id] = JSON.parse(data)
  return __turbopack_require__(client_id)
}
globalThis.__next_chunk_load__ = __turbopack_load__

hydrate()
