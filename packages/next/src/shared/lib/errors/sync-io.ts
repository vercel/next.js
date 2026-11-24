const SYNC_IO_DOCS_PATTERN =
  /https:\/\/nextjs\.org\/docs\/messages\/blocking-prerender-(random|current-time|crypto)(-client)?/

// Discriminate sync IO errors via the docs URL embedded in the user-facing
// message by `createSyncIOError`, `createSyncIORuntimeError`, and
// `createSyncIOClientError`.
export function isSyncIOError(message: string): boolean {
  return typeof message === 'string' && SYNC_IO_DOCS_PATTERN.test(message)
}

export function isSyncIOClientError(message: string): boolean {
  const match = SYNC_IO_DOCS_PATTERN.exec(message)
  return match !== null && match[2] === '-client'
}
