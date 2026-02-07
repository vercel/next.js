import type { ProxyConfig } from 'next/server'

export default async function middleware() {
  // This import should not be instrumented.
  // `trackDynamicImport` will throw if it's used in the edge runtime,
  // so it's enough to just do an import() here and see if it succeeds.
  await import('./messages')
}

export const config: ProxyConfig = {
  matcher: ['/not-instrumented/middleware'],
}
