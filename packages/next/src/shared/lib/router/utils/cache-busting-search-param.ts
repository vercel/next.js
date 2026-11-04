import { hexHash } from '../../hash'
import type {
  NEXT_ROUTER_PREFETCH_STATIC,
  NEXT_ROUTER_PREFETCH_RUNTIME_PREFETCH,
  NEXT_ROUTER_PREFETCH_RUNTIME_SHELL,
  NEXT_ROUTER_PREFETCH_RUNTIME_NAVIGATION,
} from '../../../../client/components/app-router-headers'

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
  prefetchHeader:
    | typeof NEXT_ROUTER_PREFETCH_STATIC
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_PREFETCH
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_SHELL
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_NAVIGATION
    | '0'
    | undefined,
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
  prefetchHeader:
    | typeof NEXT_ROUTER_PREFETCH_STATIC
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_PREFETCH
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_SHELL
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_NAVIGATION
    | '0'
    | undefined,
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
  prefetchHeader:
    | typeof NEXT_ROUTER_PREFETCH_STATIC
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_PREFETCH
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_SHELL
    | typeof NEXT_ROUTER_PREFETCH_RUNTIME_NAVIGATION
    | '0'
    | undefined,
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
