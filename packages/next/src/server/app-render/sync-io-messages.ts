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
    ? `  - Measure elapsed time with \`performance.now()\` instead of \`Date.now()\`\n`
    : ''
}

export function createSyncIOError(
  route: string,
  expression: string,
  type: SyncIOApiType
): Error {
  return new Error(
    `Route "${route}": Next.js encountered ${expression} during the initial render.\n\n` +
      `Without a prior data access, Next.js doesn't know whether to prerender this value or compute it on each request.\n\n` +
      `Ways to fix this:\n` +
      `  - Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call\n` +
      `  - Prerender and cache the value with \`"use cache"\`\n` +
      `  - Render the value on the client with \`"use client"\`\n` +
      elapsedTimeBullet(type) +
      `\n` +
      `Learn more: ${SYNC_IO_DOCS[type]}`
  )
}

export function createSyncIORuntimeError(
  route: string,
  expression: string,
  type: SyncIOApiType
): Error {
  return new Error(
    `Route "${route}": Next.js encountered ${expression} during the initial render.\n\n` +
      `Without a prior data access, Next.js doesn't know whether to prerender this value or compute it on each request.\n\n` +
      `Ways to fix this:\n` +
      `  - Render at request time by adding a dynamic data access (e.g. \`await connection()\`) before this call\n` +
      `  - Prerender and cache the value with \`"use cache"\`\n` +
      `  - Render the value on the client with \`"use client"\`\n` +
      elapsedTimeBullet(type) +
      `\n` +
      `Learn more: ${SYNC_IO_RUNTIME_DOCS[type]}`
  )
}

export function createSyncIOClientError(
  route: string,
  expression: string,
  type: SyncIOApiType
): Error {
  return new Error(
    `Route "${route}" used ${expression} inside a Client Component without a Suspense boundary above it. ` +
      `See more info here: ${SYNC_IO_CLIENT_DOCS[type]}`
  )
}
