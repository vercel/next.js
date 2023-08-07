// Next.js now creates an AsyncLocalStorage in the module scope, meaning we
// need to:
// 1. Install it (it's accessed as `globalthis.AsyncLocalStorage`)
// 2. Do it in an import (import ordering is guaranteed)
import { AsyncLocalStorage } from 'node:async_hooks'
globalThis.AsyncLocalStorage = AsyncLocalStorage
