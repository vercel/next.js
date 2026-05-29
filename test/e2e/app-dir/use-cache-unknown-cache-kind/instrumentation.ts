import DefaultCacheHandler from 'next/dist/server/lib/cache-handlers/default.external'

export function register() {
  globalThis[Symbol.for('@next/cache-handlers')] = {
    RemoteCache: DefaultCacheHandler,
  }
}
