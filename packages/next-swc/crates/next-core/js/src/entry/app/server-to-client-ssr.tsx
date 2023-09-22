/// <reference path="./server-to-client-ssr.d.ts" />

import { createProxy } from 'next/dist/build/webpack/loaders/next-flight-loader/module-proxy'
;('TURBOPACK { chunking-type: isolatedParallel }')
import { __turbopack_module_id__ as id } from 'CLIENT_MODULE'

import client_id, { chunks } from 'CLIENT_CHUNKS'

export default createProxy(JSON.stringify([client_id, chunks, id]))
