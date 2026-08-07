export const REQUEST_INSIGHTS_CAUSAL_COOKIE = '__next_request_insights_causal'

const DEFAULT_MAX_ENTRIES = 2_048
const DEFAULT_TTL_MS = 30_000
const CAUSAL_TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
const CAUSAL_TOKEN_LENGTH = 32
const MAX_CAUSAL_COOKIE_HEADER_LENGTH = 16 * 1024
const MAX_ORIGIN_LENGTH = 256
const MAX_PATHNAME_LENGTH = 2_048
const MAX_METHOD_LENGTH = 16
const MAX_PARENT_ROOT_REQUEST_ID_LENGTH = 128
const MAX_FETCH_INDEX = 1_000_000
const CAUSAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
const PARENT_ROOT_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const METHOD_PATTERN = /^[A-Z]+$/

export type RequestInsightsCausalTarget = {
  origin: string
  pathname: string
  method: string
}

export type RequestInsightsCausalParent = {
  parentRootRequestId: string
  parentFetchIndex: number
}

type RequestInsightsCausalHeaders = Record<
  string,
  string | string[] | undefined
>

type RequestInsightsCausalEntry = RequestInsightsCausalParent & {
  target: RequestInsightsCausalTarget
  expiresAt: number
}

type RequestInsightsCausalRegistryOptions = {
  createToken?: () => string
  maxEntries?: number
  now?: () => number
  ttlMs?: number
}

/**
 * Keeps causal data inside one Request Insights controller. Only an opaque,
 * short-lived capability crosses the loopback HTTP boundary.
 */
export class RequestInsightsCausalRegistry {
  private readonly createToken: () => string
  private readonly entries = new Map<string, RequestInsightsCausalEntry>()
  private readonly maxEntries: number
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(options: RequestInsightsCausalRegistryOptions = {}) {
    this.createToken = options.createToken ?? createCausalToken
    this.maxEntries = getPositiveInteger(
      options.maxEntries,
      DEFAULT_MAX_ENTRIES
    )
    this.now = options.now ?? (() => performance.timeOrigin + performance.now())
    this.ttlMs = getPositiveInteger(options.ttlMs, DEFAULT_TTL_MS)
  }

  mintCausalToken({
    parentRootRequestId,
    parentFetchIndex,
    target,
  }: RequestInsightsCausalParent & {
    target: RequestInsightsCausalTarget
  }): string | undefined {
    const parent = normalizeRequestInsightsCausalParent({
      parentRootRequestId,
      parentFetchIndex,
    })
    const normalizedTarget = normalizeTarget(target)
    if (!parent || !normalizedTarget) {
      return undefined
    }

    const now = this.now()
    this.prune(now)
    while (this.entries.size >= this.maxEntries) {
      const oldestToken = this.entries.keys().next().value
      if (oldestToken === undefined) break
      this.entries.delete(oldestToken)
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const token = this.createToken()
      if (!CAUSAL_TOKEN_PATTERN.test(token) || this.entries.has(token)) {
        continue
      }

      this.entries.set(token, {
        ...parent,
        target: normalizedTarget,
        expiresAt: now + this.ttlMs,
      })
      return token
    }
  }

  consumeCausalToken(
    token: string,
    target: RequestInsightsCausalTarget
  ): RequestInsightsCausalParent | undefined {
    if (!CAUSAL_TOKEN_PATTERN.test(token)) {
      return undefined
    }

    const now = this.now()
    this.prune(now)
    const entry = this.entries.get(token)
    if (!entry) {
      return undefined
    }

    // A mismatched redirect or replay also consumes the capability.
    this.entries.delete(token)
    const normalizedTarget = normalizeTarget(target)
    if (
      !normalizedTarget ||
      entry.expiresAt <= now ||
      !targetsEqual(entry.target, normalizedTarget)
    ) {
      return undefined
    }

    return Object.freeze({
      parentRootRequestId: entry.parentRootRequestId,
      parentFetchIndex: entry.parentFetchIndex,
    })
  }

  revokeCausalToken(token: string): void {
    if (CAUSAL_TOKEN_PATTERN.test(token)) {
      this.entries.delete(token)
    }
  }

  clear(): void {
    this.entries.clear()
  }

  private prune(now: number): void {
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(token)
      }
    }
  }
}

export function getRequestInsightsCausalTarget(
  url: URL,
  method: string
): RequestInsightsCausalTarget | undefined {
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    !isRequestInsightsLoopbackHostname(url.hostname)
  ) {
    return undefined
  }

  return normalizeTarget({
    origin: url.origin,
    pathname: url.pathname,
    method,
  })
}

export function getRequestInsightsCausalTargetFromRequest({
  method,
  origin,
  url,
}: {
  method: string | undefined
  origin: string | undefined
  url: string | undefined
}): RequestInsightsCausalTarget | undefined {
  if (!origin || !url) return undefined

  try {
    const trustedOrigin = new URL(origin)
    const requestUrl = new URL(url, trustedOrigin)
    if (
      trustedOrigin.username !== '' ||
      trustedOrigin.password !== '' ||
      trustedOrigin.pathname !== '/' ||
      trustedOrigin.search !== '' ||
      trustedOrigin.hash !== '' ||
      requestUrl.origin !== trustedOrigin.origin
    ) {
      return undefined
    }
    return getRequestInsightsCausalTarget(requestUrl, method ?? 'GET')
  } catch {
    return undefined
  }
}

export function isRequestInsightsSameOriginTarget(
  origin: string | undefined,
  target: RequestInsightsCausalTarget | undefined
): boolean {
  return origin !== undefined && target?.origin === origin
}

export function isRequestInsightsExecutionOriginTarget(
  origin: string | undefined,
  target: RequestInsightsCausalTarget | undefined
): boolean {
  if (!origin || !target) return false
  if (target.origin === origin) return true

  try {
    const executionOrigin = new URL(origin)
    const targetOrigin = new URL(target.origin)
    return (
      executionOrigin.protocol === targetOrigin.protocol &&
      executionOrigin.port === targetOrigin.port &&
      isRequestInsightsLoopbackHostname(executionOrigin.hostname) &&
      isRequestInsightsLoopbackHostname(targetOrigin.hostname)
    )
  } catch {
    return false
  }
}

export function getRequestInsightsExecutionOrigin({
  experimentalHttpsServer,
  fallbackPort,
  socket,
}: {
  experimentalHttpsServer: boolean | undefined
  fallbackPort: number | undefined
  socket:
    | {
        encrypted?: boolean
        localPort?: number
      }
    | null
    | undefined
}): string | undefined {
  let encrypted = false
  let port = fallbackPort

  try {
    encrypted = Boolean(socket?.encrypted)
  } catch {
    // Optional socket metadata must not affect request handling.
  }
  try {
    port = socket?.localPort ?? fallbackPort
  } catch {
    // Some internal requests use socket mocks without readable metadata.
  }

  if (
    port === undefined ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    return undefined
  }

  const protocol = encrypted || experimentalHttpsServer ? 'https' : 'http'
  return `${protocol}://localhost:${port}`
}

export function takeRequestInsightsCausalToken(
  headers: RequestInsightsCausalHeaders
): string | undefined {
  const { cookies, tokens, withinLimit } = parseCausalCookies(headers.cookie)
  if (tokens.length > 0) {
    setCookieHeader(headers, cookies)
  }
  return withinLimit &&
    tokens.length === 1 &&
    CAUSAL_TOKEN_PATTERN.test(tokens[0])
    ? tokens[0]
    : undefined
}

export function setRequestInsightsCausalCookie(
  headers: Headers,
  token: string | undefined
): boolean {
  const { cookies, tokens, withinLimit } = parseCausalCookies(
    headers.get('cookie') ?? undefined
  )
  const causalCookie =
    token && CAUSAL_TOKEN_PATTERN.test(token)
      ? `${REQUEST_INSIGHTS_CAUSAL_COOKIE}=${token}`
      : undefined
  const currentLength = cookies.join('; ').length
  const canAppend = Boolean(
    causalCookie &&
      withinLimit &&
      currentLength + (currentLength === 0 ? 0 : 2) + causalCookie.length <=
        MAX_CAUSAL_COOKIE_HEADER_LENGTH
  )

  if (!canAppend && tokens.length === 0) {
    return false
  }
  if (canAppend && causalCookie) {
    cookies.push(causalCookie)
  }
  if (cookies.length === 0) {
    headers.delete('cookie')
  } else {
    headers.set('cookie', cookies.join('; '))
  }
  return canAppend
}

function createCausalToken(): string {
  const bytes = new Uint8Array(CAUSAL_TOKEN_LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  let token = ''
  for (const byte of bytes) {
    token += CAUSAL_TOKEN_ALPHABET[byte & 0x3f]
  }
  return token
}

function isRequestInsightsLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '[::1]'
  ) {
    return true
  }

  const parts = normalized.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part)) &&
    Number(parts[0]) === 127 &&
    parts.every((part) => Number(part) <= 255)
  )
}

export function normalizeRequestInsightsCausalParent(parent: {
  parentRootRequestId: string | undefined
  parentFetchIndex: number | undefined
}): Readonly<RequestInsightsCausalParent> | undefined {
  if (
    parent.parentRootRequestId === undefined ||
    parent.parentRootRequestId.length > MAX_PARENT_ROOT_REQUEST_ID_LENGTH ||
    !PARENT_ROOT_REQUEST_ID_PATTERN.test(parent.parentRootRequestId) ||
    parent.parentFetchIndex === undefined ||
    !Number.isSafeInteger(parent.parentFetchIndex) ||
    parent.parentFetchIndex < 0 ||
    parent.parentFetchIndex > MAX_FETCH_INDEX
  ) {
    return undefined
  }
  return Object.freeze({
    parentRootRequestId: parent.parentRootRequestId,
    parentFetchIndex: parent.parentFetchIndex,
  })
}

function normalizeTarget(
  target: RequestInsightsCausalTarget
): RequestInsightsCausalTarget | undefined {
  if (
    target.origin.length > MAX_ORIGIN_LENGTH ||
    target.pathname.length > MAX_PATHNAME_LENGTH ||
    target.method.length === 0 ||
    target.method.length > MAX_METHOD_LENGTH
  ) {
    return undefined
  }

  let originUrl: URL
  try {
    originUrl = new URL(target.origin)
  } catch {
    return undefined
  }

  const method = target.method.toUpperCase()
  if (
    (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') ||
    originUrl.username !== '' ||
    originUrl.password !== '' ||
    originUrl.pathname !== '/' ||
    originUrl.search !== '' ||
    originUrl.hash !== '' ||
    !isRequestInsightsLoopbackHostname(originUrl.hostname) ||
    !target.pathname.startsWith('/') ||
    target.pathname.includes('?') ||
    target.pathname.includes('#') ||
    !METHOD_PATTERN.test(method)
  ) {
    return undefined
  }

  return { origin: originUrl.origin, pathname: target.pathname, method }
}

function targetsEqual(
  first: RequestInsightsCausalTarget,
  second: RequestInsightsCausalTarget
): boolean {
  return (
    isRequestInsightsExecutionOriginTarget(first.origin, second) &&
    first.pathname === second.pathname &&
    first.method === second.method
  )
}

function getPositiveInteger(
  value: number | undefined,
  fallback: number
): number {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback
}

function parseCausalCookies(value: string | string[] | undefined): {
  cookies: string[]
  tokens: string[]
  withinLimit: boolean
} {
  const cookies: string[] = []
  const tokens: string[] = []
  const values = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value]
  const withinLimit =
    !Array.isArray(value) &&
    values.reduce((length, item) => length + item.length, 0) <=
      MAX_CAUSAL_COOKIE_HEADER_LENGTH

  for (const headerValue of values) {
    for (const rawCookie of headerValue.split(';')) {
      const cookie = rawCookie.trim()
      if (!cookie) continue
      const separatorIndex = cookie.indexOf('=')
      const name =
        separatorIndex === -1 ? cookie : cookie.slice(0, separatorIndex).trim()
      if (name === REQUEST_INSIGHTS_CAUSAL_COOKIE) {
        tokens.push(
          separatorIndex === -1 ? '' : cookie.slice(separatorIndex + 1).trim()
        )
      } else {
        cookies.push(cookie)
      }
    }
  }

  return { cookies, tokens, withinLimit }
}

function setCookieHeader(
  headers: RequestInsightsCausalHeaders,
  cookies: string[]
): void {
  if (cookies.length === 0) {
    delete headers.cookie
  } else {
    headers.cookie = cookies.join('; ')
  }
}
