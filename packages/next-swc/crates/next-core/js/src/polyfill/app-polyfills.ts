import 'next/dist/server/node-polyfill-fetch'
import 'next/dist/server/node-polyfill-web-streams'
import 'next/dist/server/node-polyfill-headers'
import './async-local-storage'
;(globalThis as any).__NEXT_USE_UNDICI = true
