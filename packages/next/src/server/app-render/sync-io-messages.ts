export type SyncIOApiType = 'time' | 'random' | 'crypto'

const SYNC_IO_DOCS: Record<SyncIOApiType, string> = {
  time: 'https://nextjs.org/docs/messages/blocking-prerender-current-time',
  random: 'https://nextjs.org/docs/messages/blocking-prerender-random',
  crypto: 'https://nextjs.org/docs/messages/blocking-prerender-crypto',
}

const SYNC_IO_CLIENT_DOCS: Record<SyncIOApiType, string> = {
  time: 'https://nextjs.org/docs/messages/blocking-prerender-current-time-client',
  random: 'https://nextjs.org/docs/messages/blocking-prerender-random-client',
  crypto: 'https://nextjs.org/docs/messages/blocking-prerender-crypto-client',
}

const SYNC_IO_RUNTIME_DOCS: Record<SyncIOApiType, string> = {
  time: 'https://nextjs.org/docs/messages/blocking-prerender-current-time',
  random: 'https://nextjs.org/docs/messages/blocking-prerender-random',
  crypto: 'https://nextjs.org/docs/messages/blocking-prerender-crypto',
}

function elapsedTimeBullet(type: SyncIOApiType, docsUrl: string): string {
  return type === 'time'
    ? `\n  - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\`\n    ${docsUrl}#for-telemetry-use-a-timing-api`
    : ''
}

const CACHE_ANCHOR: Record<SyncIOApiType, string> = {
  random: '#cache-the-random-value',
  time: '#cache-the-timestamp',
  crypto: '#cache-the-generated-value',
}

function createSyncIOErrorImpl(
  route: string,
  expression: string,
  type: SyncIOApiType,
  docsUrl: string
): Error {
  return new Error(
    `Route "${route}": Next.js encountered the unstable value ${expression} while prerendering.\n\n` +
      `This value can change between renders, so it must be either prerendered or computed later.\n\n` +
      `Ways to fix this:\n` +
      `  - [dynamic] Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call\n    ${docsUrl}#generate-on-every-request\n` +
      `  - [cache] Prerender and cache the value with \`"use cache"\`\n    ${docsUrl}${CACHE_ANCHOR[type]}\n` +
      `  - [client] Render the value on the client with \`"use client"\`\n    ${docsUrl}#render-on-the-client` +
      elapsedTimeBullet(type, docsUrl)
  )
}

export function createSyncIOError(
  route: string,
  expression: string,
  type: SyncIOApiType
): Error {
  return createSyncIOErrorImpl(route, expression, type, SYNC_IO_DOCS[type])
}

export function createSyncIORuntimeError(
  route: string,
  expression: string,
  type: SyncIOApiType
): Error {
  return createSyncIOErrorImpl(
    route,
    expression,
    type,
    SYNC_IO_RUNTIME_DOCS[type]
  )
}

export function createSyncIOClientError(
  route: string,
  expression: string,
  type: SyncIOApiType
): Error {
  const docsUrl = SYNC_IO_CLIENT_DOCS[type]
  return new Error(
    `Route "${route}": Next.js encountered the unstable value ${expression} in a Client Component.\n\n` +
      `This value would be evaluated during the prerender, instead of recomputed on each visit.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`\n    ${docsUrl}#wrap-in-or-move-into-suspense\n` +
      `  - [defer] Move the read into a \`useEffect\` or event handler\n    ${docsUrl}#move-into-effect-or-event-handler` +
      elapsedTimeBullet(type, docsUrl)
  )
}
