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

function elapsedTimeBullet(type: SyncIOApiType): string {
  return type === 'time'
    ? `\n  - [measure] If the value is for telemetry, use a timing API such as \`performance.now()\``
    : ''
}

// Section of each sync IO error page that explains how to handle a read that
// happens inside a dependency.
const EXTERNAL_LIBRARY_DOCS_ANCHOR =
  '#when-the-read-comes-from-an-external-library'

/**
 * Names the third-party package that made the read. Only the package is named,
 * not its stack frames, so the top frame of the error stays in code the user
 * owns. How to deal with it is covered by the linked error page.
 *
 * The dev overlay parses this sentence (`SYNC_IO_PACKAGE_PATTERN` in
 * `next-devtools/dev-overlay/container/errors.tsx`), so keep them in sync.
 */
function thirdPartyPackageSentence(thirdPartyPackage: string | null): string {
  return thirdPartyPackage === null
    ? ''
    : ` The call comes from the \`${thirdPartyPackage}\` package.`
}

/**
 * Links to the error page's external-library section when a dependency made
 * the read.
 */
export function getSyncIODocsUrl(
  docsUrl: string,
  thirdPartyPackage: string | null
): string {
  return thirdPartyPackage === null
    ? docsUrl
    : docsUrl + EXTERNAL_LIBRARY_DOCS_ANCHOR
}

function createSyncIOErrorImpl(
  route: string,
  expression: string,
  type: SyncIOApiType,
  docsUrl: string,
  thirdPartyPackage: string | null
): Error {
  return new Error(
    `Route "${route}": Next.js encountered the unstable value ${expression} while prerendering.\n\n` +
      `This value can change between renders, so it must be either prerendered or computed later.` +
      thirdPartyPackageSentence(thirdPartyPackage) +
      `\n\n` +
      `Ways to fix this:\n` +
      `  - [dynamic] Render at request time by calling \`await io()\` before this read inside a parent \`<Suspense>\` boundary\n` +
      `  - [cache] Prerender and cache the value with \`"use cache"\`\n` +
      `  - [client] In a Client Component, read the value in \`useEffect\` or an event handler` +
      elapsedTimeBullet(type) +
      `\n\nLearn more: ${getSyncIODocsUrl(docsUrl, thirdPartyPackage)}`
  )
}

export function createSyncIOError(
  route: string,
  expression: string,
  type: SyncIOApiType,
  thirdPartyPackage: string | null = null
): Error {
  return createSyncIOErrorImpl(
    route,
    expression,
    type,
    SYNC_IO_DOCS[type],
    thirdPartyPackage
  )
}

export function createSyncIORuntimeError(
  route: string,
  expression: string,
  type: SyncIOApiType,
  thirdPartyPackage: string | null = null
): Error {
  return createSyncIOErrorImpl(
    route,
    expression,
    type,
    SYNC_IO_RUNTIME_DOCS[type],
    thirdPartyPackage
  )
}

export function createSyncIOClientError(
  route: string,
  expression: string,
  type: SyncIOApiType,
  thirdPartyPackage: string | null = null
): Error {
  const docsUrl = SYNC_IO_CLIENT_DOCS[type]
  return new Error(
    `Route "${route}": Next.js encountered the unstable value ${expression} in a Client Component.\n\n` +
      `This value would be evaluated during the prerender, instead of recomputed on each visit.` +
      thirdPartyPackageSentence(thirdPartyPackage) +
      `\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Wrap the Client Component in \`<Suspense fallback={...}>\`\n` +
      `  - [defer] Move the read into a \`useEffect\` or event handler` +
      elapsedTimeBullet(type) +
      `\n\nLearn more: ${getSyncIODocsUrl(docsUrl, thirdPartyPackage)}`
  )
}
