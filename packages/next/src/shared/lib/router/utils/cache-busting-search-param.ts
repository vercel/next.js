import { hexHash } from '../../hash'

const CACHE_BUSTING_SEARCH_PARAM_DIGEST_BYTES = 12
const textEncoder = new TextEncoder()

function encodeCacheBustingSearchParam(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function normalizeCacheBustingInput(
  value: string | string[] | undefined
): string {
  if (value === undefined) {
    return '0'
  }
  return Array.isArray(value) ? value.join(',') : value
}

function createCacheBustingSearchParamInput(
  prefetchHeader: '1' | '2' | '3' | '0' | undefined,
  segmentPrefetchHeader: string | string[] | undefined,
  stateTreeHeader: string | string[] | undefined,
  nextUrlHeader: string | string[] | undefined
): string | null {
  if (
    (prefetchHeader === undefined || prefetchHeader === '0') &&
    segmentPrefetchHeader === undefined &&
    stateTreeHeader === undefined &&
    nextUrlHeader === undefined
  ) {
    return null
  }

  return [
    prefetchHeader ?? '0',
    normalizeCacheBustingInput(segmentPrefetchHeader),
    normalizeCacheBustingInput(stateTreeHeader),
    normalizeCacheBustingInput(nextUrlHeader),
  ].join(',')
}

async function computeCacheBustingSearchParamFromInput(
  input: string
): Promise<string> {
  // Truncate SHA-256 to 96 bits to keep `_rsc` compact
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(input)
  )
  return encodeCacheBustingSearchParam(
    new Uint8Array(digest).subarray(0, CACHE_BUSTING_SEARCH_PARAM_DIGEST_BYTES)
  )
}

export async function computeCacheBustingSearchParam(
  prefetchHeader: '1' | '2' | '3' | '0' | undefined,
  segmentPrefetchHeader: string | string[] | undefined,
  stateTreeHeader: string | string[] | undefined,
  nextUrlHeader: string | string[] | undefined
): Promise<string> {
  const input = createCacheBustingSearchParamInput(
    prefetchHeader,
    segmentPrefetchHeader,
    stateTreeHeader,
    nextUrlHeader
  )
  if (input === null) {
    return ''
  }

  return computeCacheBustingSearchParamFromInput(input)
}

export function computeLegacyCacheBustingSearchParam(
  prefetchHeader: '1' | '2' | '3' | '0' | undefined,
  segmentPrefetchHeader: string | string[] | undefined,
  stateTreeHeader: string | string[] | undefined,
  nextUrlHeader: string | string[] | undefined
): string {
  const input = createCacheBustingSearchParamInput(
    prefetchHeader,
    segmentPrefetchHeader,
    stateTreeHeader,
    nextUrlHeader
  )
  if (input === null) {
    return ''
  }

  return hexHash(input)
}
