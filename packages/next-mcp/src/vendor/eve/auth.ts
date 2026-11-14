/**
 * Route authentication contract and built-in strategies.
 *
 * Adapted from vercel/eve (Apache-2.0, see ./LICENSE):
 *   packages/eve/src/channel/auth/definitions.ts
 *   packages/eve/src/channel/principal-identity.ts
 *   packages/eve/src/shared/network-address.ts
 * at commit 4f326324524bf15fc9657df5f41e1506f206fffa.
 *
 * Changes from upstream:
 * - `localDev()` detects `next dev` instead of `eve dev` / `vercel dev`.
 * - `extractBearerToken()` throws on a present-but-malformed header instead of
 *   returning `null`, so a bad credential is a hard 401 rather than a skip.
 * - Auth errors accept an RFC 6750 `error` code for the Bearer challenge.
 * - `none()` is marked so the route can report `current: null` and warn.
 *
 * This file is a candidate for a shared package with eve; keep the public
 * names and shapes identical to upstream.
 */

/**
 * Verified identity of the caller, as exposed to tools via
 * `ctx.session.auth.current`.
 */
export interface SessionAuthContext {
  /** Stable identifier of the principal, unique within `authenticator`. */
  readonly principalId: string
  /** Kind of principal, such as `"user"` or `"service"`. */
  readonly principalType: string
  /** Which strategy produced this identity, such as `"authjs"` or `"jwt"`. */
  readonly authenticator: string
  readonly issuer?: string
  readonly subject?: string
  readonly attributes: Readonly<Record<string, string | readonly string[]>>
}

/** Verified identity returned by an {@link AuthFn}. */
export type AuthResult = SessionAuthContext

/**
 * Route auth callback. Within an `auth` list:
 *
 * - A {@link SessionAuthContext} accepts the request and stops the walk.
 * - `null` or `undefined` skips to the next entry.
 * - Throwing {@link UnauthenticatedError} or {@link ForbiddenError} rejects
 *   the request with that error's 401 / 403 response.
 *
 * If every entry skips, the route answers 401.
 */
export type AuthFn = (
  request: Request
) =>
  | SessionAuthContext
  | null
  | undefined
  | Promise<SessionAuthContext | null | undefined>

// ---------------------------------------------------------------------------
// Unauthorized responses
// ---------------------------------------------------------------------------

/** One `www-authenticate` challenge on a failure response. */
export interface UnauthorizedChallenge {
  readonly scheme: 'Basic' | 'Bearer'
  readonly parameters?: Readonly<Record<string, string>>
}

/** Options accepted by {@link UnauthenticatedError} and {@link ForbiddenError}. */
export interface AuthErrorOptions {
  /**
   * RFC 6750 error code for the default `Bearer` challenge, such as
   * `"invalid_token"`, `"invalid_request"`, or `"insufficient_scope"`.
   * Ignored when `challenges` is set.
   */
  readonly error?: string
  /** Machine-readable error code in the JSON body. */
  readonly code?: string
  /** Human-readable message in the JSON body. Keep it free of internals. */
  readonly message?: string
  /** Explicit `www-authenticate` challenges. */
  readonly challenges?: readonly UnauthorizedChallenge[]
}

interface UnauthorizedResponseOptions extends AuthErrorOptions {
  readonly status: 401 | 403
}

/** @internal */
export function createUnauthorizedResponse(
  opts: UnauthorizedResponseOptions
): Response {
  const { status } = opts
  const code = opts.code ?? (status === 403 ? 'forbidden' : 'unauthorized')
  const message =
    opts.message ??
    (status === 403
      ? 'Forbidden.'
      : 'Authorization is required for this route.')

  let challenges = opts.challenges
  if (challenges === undefined) {
    if (opts.error !== undefined) {
      challenges = [{ scheme: 'Bearer', parameters: { error: opts.error } }]
    } else if (status === 401) {
      challenges = [{ scheme: 'Bearer' }]
    } else {
      challenges = []
    }
  }

  const headers = new Headers({ 'cache-control': 'no-store' })
  for (const challenge of challenges) {
    headers.append('www-authenticate', formatChallenge(challenge))
  }

  return Response.json({ code, error: message, ok: false }, { headers, status })
}

function formatChallenge(challenge: UnauthorizedChallenge): string {
  if (
    challenge.parameters === undefined ||
    Object.keys(challenge.parameters).length === 0
  ) {
    return challenge.scheme
  }
  const rendered = Object.entries(challenge.parameters)
    .map(([key, value]) => `${key}="${escapeAuthChallengeParameter(value)}"`)
    .join(', ')
  return `${challenge.scheme} ${rendered}`
}

/** @internal Escapes a value for an HTTP auth challenge quoted string. */
export function escapeAuthChallengeParameter(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/**
 * Throw from an {@link AuthFn} to reject the request with a 401 and a
 * `www-authenticate` challenge.
 */
export class UnauthenticatedError extends Error {
  readonly response: Response

  constructor(opts: AuthErrorOptions = {}) {
    super(opts.message ?? 'Authorization is required for this route.')
    this.name = 'UnauthenticatedError'
    this.response = createUnauthorizedResponse({ ...opts, status: 401 })
  }
}

/**
 * Throw from an {@link AuthFn} to reject an authenticated caller that is not
 * allowed to use this route with a 403.
 */
export class ForbiddenError extends Error {
  readonly response: Response

  constructor(opts: AuthErrorOptions = {}) {
    super(opts.message ?? 'Forbidden.')
    this.name = 'ForbiddenError'
    this.response = createUnauthorizedResponse({ ...opts, status: 403 })
  }
}

/** @internal */
export function isAuthError(
  error: unknown
): error is UnauthenticatedError | ForbiddenError {
  return (
    error instanceof UnauthenticatedError || error instanceof ForbiddenError
  )
}

// ---------------------------------------------------------------------------
// Bearer token extraction
// ---------------------------------------------------------------------------

// RFC 6750 §2.1 `b64token`. A single token never contains whitespace or a
// comma, so this also rejects headers that were sent more than once (which
// `Headers#get` joins with ", ").
const BEARER_HEADER = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/i

/**
 * Parses an `Authorization: Bearer <token>` header.
 *
 * Returns `null` only when the header is absent, so an `AuthFn` can skip to
 * the next strategy. A header that is present but empty, uses another scheme,
 * is malformed, or was sent more than once throws an
 * {@link UnauthenticatedError} (`invalid_request`), so a bad credential is
 * never silently ignored.
 */
export function extractBearerToken(authorizationHeader: string): string
export function extractBearerToken(
  authorizationHeader: string | null | undefined
): string | null
export function extractBearerToken(
  authorizationHeader: string | null | undefined
): string | null {
  if (authorizationHeader === null || authorizationHeader === undefined) {
    return null
  }
  const match = BEARER_HEADER.exec(authorizationHeader.trim())
  if (match === null) {
    throw new UnauthenticatedError({
      error: 'invalid_request',
      message: 'Malformed Authorization header.',
    })
  }
  return match[1]
}

// ---------------------------------------------------------------------------
// Auth walk
// ---------------------------------------------------------------------------

/**
 * Walks `auth` in order. The first entry returning a
 * {@link SessionAuthContext} wins. If every entry skips, returns a 401
 * response. Auth errors thrown by an entry become their response; any other
 * exception propagates to the caller.
 *
 * @internal
 */
export async function routeAuth(
  request: Request,
  auth: readonly AuthFn[]
): Promise<SessionAuthContext | Response> {
  try {
    for (const fn of auth) {
      const result = await fn(request)
      if (result) return result
    }
  } catch (error) {
    if (isAuthError(error)) return error.response
    throw error
  }

  // A presented Bearer credential that no strategy accepted is invalid, not
  // absent (RFC 6750 §3.1).
  const authorization = request.headers.get('authorization')
  const presentedBearer =
    authorization !== null && /^Bearer(?:\s|$)/i.test(authorization.trim())
  return createUnauthorizedResponse({
    status: 401,
    ...(presentedBearer ? { error: 'invalid_token' } : {}),
  })
}

// ---------------------------------------------------------------------------
// Built-in strategies
// ---------------------------------------------------------------------------

const NONE_AUTH_SYMBOL = Symbol.for('next.mcp.auth.none')
const LOCAL_DEV_AUTH_SYMBOL = Symbol.for('next.mcp.auth.localDev')

/** @internal Identity `none()` returns; the route reports it as `null`. */
export const ANONYMOUS_SESSION_AUTH_CONTEXT: SessionAuthContext = Object.freeze(
  {
    attributes: Object.freeze({}),
    authenticator: 'none',
    principalId: 'anonymous',
    principalType: 'anonymous',
  }
)

const LOCAL_DEV_SESSION_AUTH_CONTEXT: SessionAuthContext = Object.freeze({
  attributes: Object.freeze({}),
  authenticator: 'local-dev',
  principalId: 'local-dev',
  principalType: 'local-dev',
})

/**
 * Accepts every request anonymously. Tools see
 * `ctx.session.auth.current === null`.
 *
 * Anyone who can reach the route can call its tools, so the route logs a
 * warning when it loads. Use it only for servers that are public on purpose.
 */
export function none(): AuthFn {
  const authenticate: AuthFn = () => ANONYMOUS_SESSION_AUTH_CONTEXT
  Object.defineProperty(authenticate, NONE_AUTH_SYMBOL, { value: true })
  return authenticate
}

/** @internal */
export function isNoneAuth(fn: AuthFn): boolean {
  return (fn as unknown as Record<symbol, unknown>)[NONE_AUTH_SYMBOL] === true
}

/**
 * Accepts any local caller while the app runs under `next dev`, as a
 * synthetic `local-dev` principal. Everywhere else, including `next start`
 * and every deployment, it skips, so a route whose only strategy is
 * `localDev()` answers 401 in production.
 *
 * Whether the process is a dev server is a property of the process, never of
 * the request, so no header can flip it. Under `next dev` it also refuses
 * requests addressed to a non-loopback host, and browser requests whose
 * `Origin` is not loopback, so a web page cannot use the developer's browser
 * to reach local tools (including through DNS rebinding).
 *
 * `next dev` can listen on every network interface. A caller on another
 * machine that sends `Host: localhost` is not distinguishable here, so do not
 * expose a dev server to an untrusted network while it serves `localDev()`.
 */
export function localDev(): AuthFn {
  const authenticate: AuthFn = (request) =>
    isNextDevServer() && !isNonLocalRequest(request)
      ? LOCAL_DEV_SESSION_AUTH_CONTEXT
      : null
  Object.defineProperty(authenticate, LOCAL_DEV_AUTH_SYMBOL, { value: true })
  return authenticate
}

/** @internal */
export function isLocalDevAuth(fn: AuthFn): boolean {
  return (
    (fn as unknown as Record<symbol, unknown>)[LOCAL_DEV_AUTH_SYMBOL] === true
  )
}

/** @internal Whether this process is `next dev` (not `next build`/`start`). */
export function isNextDevServer(): boolean {
  return Boolean(process.env.__NEXT_DEV_SERVER)
}

function isNonLocalRequest(request: Request): boolean {
  const target = parseUrl(request.url)
  if (target === null || !isLoopbackHostname(target.hostname)) return true
  const host = request.headers.get('host')
  if (host !== null) {
    const authority = parseUrl(`http://${host}`)
    if (authority === null || !isLoopbackHostname(authority.hostname)) {
      return true
    }
  }
  const origin = request.headers.get('origin')
  if (origin === null) return false
  const originUrl = parseUrl(origin)
  return originUrl === null || !isLoopbackHostname(originUrl.hostname)
}

/** @internal */
export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  )
}

/** @internal `URL.parse` for Node.js versions that predate it. */
export function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}
