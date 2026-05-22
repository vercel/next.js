export type SyncIOApiType = 'time' | 'random' | 'crypto'

const SYNC_IO_DOCS: Record<SyncIOApiType, string> = {
  time: 'https://nextjs.org/docs/messages/next-prerender-current-time',
  random: 'https://nextjs.org/docs/messages/next-prerender-random',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-crypto',
}

const SYNC_IO_CLIENT_DOCS: Record<SyncIOApiType, string> = {
  time: 'https://nextjs.org/docs/messages/next-prerender-current-time-client',
  random: 'https://nextjs.org/docs/messages/next-prerender-random-client',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-crypto-client',
}

const SYNC_IO_RUNTIME_DOCS: Record<SyncIOApiType, string> = {
  time: 'https://nextjs.org/docs/messages/next-prerender-runtime-current-time',
  random: 'https://nextjs.org/docs/messages/next-prerender-runtime-random',
  crypto: 'https://nextjs.org/docs/messages/next-prerender-runtime-crypto',
}

function elapsedTimeBullet(type: SyncIOApiType): string {
  return type === 'time'
    ? `  - If the value is for telemetry, use a timing API such as \`performance.now()\`\n`
    : ''
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
      `  - Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call\n` +
      `  - Prerender and cache the value with \`"use cache"\`\n` +
      `  - Render the value on the client with \`"use client"\`\n` +
      elapsedTimeBullet(type) +
      `\n` +
      `Learn more: ${docsUrl}`
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
  return new Error(
    `Route "${route}": Next.js encountered the unstable value ${expression} in a Client Component.\n\n` +
      `This value would be evaluated during the prerender, instead of recomputed on each visit.\n\n` +
      `Ways to fix this:\n` +
      `  - Wrap the Client Component in \`<Suspense fallback={...}>\`\n` +
      `  - Move the read into a \`useEffect\` or event handler\n` +
      elapsedTimeBullet(type) +
      `\n` +
      `Learn more: ${SYNC_IO_CLIENT_DOCS[type]}`
  )
}
