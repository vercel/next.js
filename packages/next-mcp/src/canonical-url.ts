import {
  isLoopbackHostname,
  isNextDevServer,
  parseUrl,
} from './vendor/eve/auth'

/**
 * Where the server is publicly reachable, resolved once when the route module
 * loads. Request headers are never trusted for this.
 */
export interface CanonicalLocation {
  /** The canonical URL. Origin-only unless the author passed `url`. */
  readonly url: URL
  /** Hostnames (no port) a request's `Host` header may carry. */
  readonly allowedHostnames: readonly string[]
  /** Exact origins a browser request's `Origin` header may carry. */
  readonly allowedOrigins: ReadonlySet<string>
  /** Under `next dev`, any loopback origin is also allowed. */
  readonly allowLoopbackOrigins: boolean
}

interface CanonicalOptions {
  readonly url?: string
  readonly allowedHosts?: readonly string[]
  readonly allowedOrigins?: readonly string[]
}

/**
 * Resolves the canonical URL, following the same model as `metadataBase`:
 *
 * 1. The explicit `url` option.
 * 2. Under `next dev`, `localhost`.
 * 3. On Vercel, the preview deployment's branch URL (or deployment URL) for
 *    previews, and `VERCEL_PROJECT_PRODUCTION_URL` for production.
 * 4. Otherwise, throw. Route modules load during `next build`, so this fails
 *    the build instead of serving with a guessed URL.
 */
export function resolveCanonicalLocation(
  routeName: string,
  options: CanonicalOptions
): CanonicalLocation {
  const fail = (message: string): never => {
    throw new Error(`[@next/mcp] mcpRoute("${routeName}"): ${message}`)
  }

  const dev = isNextDevServer()
  const vercelHosts = dev ? [] : vercelSystemHosts()

  let url: URL
  if (options.url !== undefined) {
    url = parseCanonicalUrl(options.url, fail)
  } else if (dev) {
    const protocol = process.env.__NEXT_EXPERIMENTAL_HTTPS ? 'https' : 'http'
    url = new URL(`${protocol}://localhost:${process.env.PORT || 3000}`)
  } else {
    const host = vercelCanonicalHost()
    if (host === undefined) {
      return fail(
        'cannot resolve the public URL of this MCP server. Pass `url` (for example `url: "https://example.com/mcp"`), or deploy to Vercel where it is resolved automatically.'
      )
    }
    url = new URL(`https://${host}`)
  }

  const allowedHostnames = new Set<string>([url.hostname])
  for (const host of options.allowedHosts ?? []) {
    allowedHostnames.add(parseHostname(host, fail))
  }
  for (const host of vercelHosts)
    allowedHostnames.add(parseHostname(host, fail))
  if (dev) {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      allowedHostnames.add(host)
    }
  }

  const allowedOrigins = new Set<string>()
  if (options.allowedOrigins !== undefined) {
    for (const origin of options.allowedOrigins) {
      allowedOrigins.add(parseOrigin(origin, fail))
    }
  } else {
    allowedOrigins.add(url.origin)
    for (const host of vercelHosts) allowedOrigins.add(`https://${host}`)
  }

  return {
    url,
    allowedHostnames: [...allowedHostnames],
    allowedOrigins,
    allowLoopbackOrigins: dev,
  }
}

function parseCanonicalUrl(value: string, fail: (m: string) => never): URL {
  const url = parseUrl(value)
  if (url === null) return fail(`\`url\` is not an absolute URL: "${value}".`)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail('`url` must use https.')
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    return fail('`url` must use https unless it points at a loopback host.')
  }
  if (url.username || url.password || url.search || url.hash) {
    return fail('`url` must not contain credentials, a query, or a fragment.')
  }
  return url
}

function parseHostname(value: string, fail: (m: string) => never): string {
  const url = parseUrl(`http://${value}`)
  if (
    url === null ||
    value.includes('/') ||
    url.username ||
    url.password ||
    url.hostname === ''
  ) {
    return fail(`\`allowedHosts\` entry is not a host name: "${value}".`)
  }
  return url.hostname
}

function parseOrigin(value: string, fail: (m: string) => never): string {
  const url = parseUrl(value)
  if (url === null || url.origin === 'null' || url.origin !== value) {
    return fail(
      `\`allowedOrigins\` entry is not an exact origin (scheme://host[:port]): "${value}".`
    )
  }
  return url.origin
}

function vercelCanonicalHost(): string | undefined {
  if (!process.env.VERCEL) return undefined
  if (process.env.VERCEL_ENV === 'production') {
    return process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  }
  return process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
}

/** Hosts Vercel itself routes to this deployment. */
function vercelSystemHosts(): string[] {
  if (!process.env.VERCEL) return []
  const hosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
  if (process.env.VERCEL_ENV === 'production') {
    hosts.push(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  }
  return hosts.filter((host): host is string => Boolean(host))
}
