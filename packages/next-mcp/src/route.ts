import {
  createMcpHandler,
  hostHeaderValidationResponse,
  McpServer,
  originValidationResponse,
} from '@modelcontextprotocol/server'

import { resolveCanonicalLocation } from './canonical-url'
import { prepareTool, registerTool, type PreparedTool } from './tool-adapter'
import {
  ANONYMOUS_SESSION_AUTH_CONTEXT,
  isLoopbackHostname,
  isNoneAuth,
  parseUrl,
  routeAuth,
  type AuthFn,
  type SessionAuthContext,
} from './vendor/eve/auth'
import type { McpSkills } from './skills'
import type { AnyToolDefinition } from './vendor/eve/tool-definition'
import { logUnexpectedError } from './vendor/eve/tool-errors'

/** Upper bound for an MCP POST body. Tool arguments are small JSON. */
const DEFAULT_MAX_REQUEST_BODY_SIZE = 1024 * 1024

export interface McpRouteOptions {
  /** Reported to clients in `serverInfo`. */
  readonly name: string
  /** Reported to clients in `serverInfo`. */
  readonly version: string
  /**
   * Who may call this server: one strategy or an ordered list, first match
   * wins. Required, with no default. Use `localDev()` while developing, and
   * write `none()` to serve the public on purpose.
   */
  readonly auth: AuthFn | readonly AuthFn[]
  /**
   * The tools to serve. The key is the tool's name. Use explicit imports, or
   * `toolsFromGlob(import.meta.glob("./tools/*.ts", { eager: true }))`.
   */
  readonly tools: Readonly<Record<string, AnyToolDefinition>>
  /** Server-level guidance for the connecting model. */
  readonly instructions?: string
  /**
   * The public URL of this server. Defaults to `localhost` under `next dev`
   * and the deployment URL on Vercel; required everywhere else.
   */
  readonly url?: string
  /**
   * Exact origins (`scheme://host[:port]`) allowed to call from a browser.
   * Defaults to the canonical origin. Loopback origins are added under
   * `next dev`.
   */
  readonly allowedOrigins?: readonly string[]
  /** Additional `Host` values to accept, such as a custom domain alias. */
  readonly allowedHosts?: readonly string[]
  /** Maximum POST body size in bytes. Defaults to 1 MiB. */
  readonly maxRequestBodySize?: number
  /**
   * Agent Skills to serve alongside the tools, from `@next/mcp/skills`:
   * `skills: skillsFromDirectory(path.join(process.cwd(), "skills"))`.
   * Skills sit behind the same `auth` as tools.
   */
  readonly skills?: McpSkills
}

type RouteHandler = (request: Request) => Promise<Response>

/** The complete HTTP surface of an MCP server, to re-export from `route.ts`. */
export interface McpRouteHandlers {
  readonly GET: RouteHandler
  readonly POST: RouteHandler
  readonly DELETE: RouteHandler
}

/**
 * Turns a `route.ts` into a stateless MCP server over Streamable HTTP.
 *
 * ```ts
 * // app/mcp/route.ts
 * import { mcpRoute } from "@next/mcp"
 * import { localDev } from "@next/mcp/auth"
 * import roll_dice from "./tools/roll_dice"
 *
 * export const { GET, POST, DELETE } = mcpRoute({
 *   name: "dice",
 *   version: "0.1.0",
 *   auth: localDev(),
 *   tools: { roll_dice },
 * })
 * ```
 *
 * Every request passes, in order: a `Host` check, an `Origin` check, the
 * `auth` list, then MCP dispatch on a fresh server. Tools run inside the
 * route's request context.
 *
 * Invalid options throw when the module loads, which fails `next build`.
 */
export function mcpRoute(options: McpRouteOptions): McpRouteHandlers {
  const routeName =
    typeof options?.name === 'string' && options.name !== ''
      ? options.name
      : '(unnamed)'
  const fail = (message: string): never => {
    throw new Error(`[@next/mcp] mcpRoute("${routeName}"): ${message}`)
  }

  if (typeof options !== 'object' || options === null) {
    fail('expected an options object.')
  }
  if (typeof options.name !== 'string' || options.name.trim() === '') {
    fail('`name` is required.')
  }
  if (typeof options.version !== 'string' || options.version.trim() === '') {
    fail('`version` is required.')
  }

  const auth = normalizeAuth(options.auth, fail)

  if (
    typeof options.tools !== 'object' ||
    options.tools === null ||
    Array.isArray(options.tools)
  ) {
    fail('`tools` must be an object whose keys are tool names.')
  }
  const tools: PreparedTool[] = Object.entries(options.tools).map(
    ([name, tool]) => prepareTool(routeName, name, tool)
  )

  const maxRequestBodySize =
    options.maxRequestBodySize ?? DEFAULT_MAX_REQUEST_BODY_SIZE
  if (
    typeof maxRequestBodySize !== 'number' ||
    !Number.isFinite(maxRequestBodySize) ||
    maxRequestBodySize <= 0
  ) {
    fail('`maxRequestBodySize` must be a positive number of bytes.')
  }

  const skills = options.skills
  if (
    skills !== undefined &&
    (typeof skills !== 'object' ||
      skills === null ||
      typeof skills.extension?.attach !== 'function')
  ) {
    fail('`skills` must come from `skillsFromDirectory` in "@next/mcp/skills".')
  }

  const location = resolveCanonicalLocation(routeName, options)

  if (auth.some(isNoneAuth)) {
    console.warn(
      `[@next/mcp] mcpRoute("${routeName}") is a public MCP server: its auth list includes none(), so anyone who can reach it can call its tools.`
    )
  }

  function createServer(
    current: SessionAuthContext | null,
    request: Request
  ): McpServer {
    const server = new McpServer(
      { name: options.name, version: options.version },
      {
        // Servers are per request and never send notifications, so nothing
        // may advertise listChanged (the skills extension would by default).
        capabilities: {
          tools: { listChanged: false },
          ...(skills === undefined
            ? {}
            : { resources: { listChanged: false } }),
        },
        ...(options.instructions === undefined
          ? {}
          : { instructions: options.instructions }),
      }
    )
    for (const tool of tools) registerTool(server, tool, current, request)
    skills?.extension.attach(server)
    return server
  }

  const allowedOriginHostnames = [
    ...new Set(
      [...location.allowedOrigins].map((origin) => new URL(origin).hostname)
    ),
  ]

  async function handle(request: Request): Promise<Response> {
    // 1. Host. Reading the request first also keeps the route dynamic, so it
    //    is never prerendered.
    const hostFailure = hostHeaderValidationResponse(request, [
      ...location.allowedHostnames,
    ])
    if (hostFailure !== undefined) return hostFailure

    // 2. Origin. Missing passes (non-browser clients); `null` and unparseable
    //    values are rejected; present values must match an exact origin.
    const originFailure = checkOrigin(request)
    if (originFailure !== undefined) return originFailure

    // 3. Authentication.
    let identity: SessionAuthContext | Response
    try {
      identity = await routeAuth(request, auth)
    } catch (error) {
      const errorId = logUnexpectedError(
        `mcpRoute("${routeName}"): an auth strategy threw`,
        error
      )
      return jsonRpcError(500, -32603, `Internal error (errorId: ${errorId})`)
    }
    if (identity instanceof Response) return identity

    // 4-6. Build a fresh server for this caller and dispatch. The handler is
    //      per request so the verified identity is closed over, never looked
    //      up from anything the request carries.
    const current =
      identity === ANONYMOUS_SESSION_AUTH_CONTEXT ? null : identity
    const handler = createMcpHandler(() => createServer(current, request), {
      legacy: 'stateless',
      maxRequestBodySize,
      onerror: (error) => {
        logUnexpectedError(
          `mcpRoute("${routeName}"): MCP transport error`,
          error
        )
      },
    })
    return await handler.fetch(request)
  }

  function checkOrigin(request: Request): Response | undefined {
    const origin = request.headers.get('origin')
    if (origin === null || origin === '') return undefined

    const parsed = parseUrl(origin)
    const loopbackAllowed =
      location.allowLoopbackOrigins &&
      parsed !== null &&
      isLoopbackHostname(parsed.hostname)
    const hostnames = loopbackAllowed
      ? [parsed!.hostname]
      : allowedOriginHostnames
    // The SDK rejects `null`, unparseable values, and unknown hostnames.
    const sdkFailure = originValidationResponse(request, hostnames)
    if (sdkFailure !== undefined) return sdkFailure
    // The SDK compares hostnames only; scheme and port must match too.
    if (
      !loopbackAllowed &&
      (parsed === null || !location.allowedOrigins.has(parsed.origin))
    ) {
      return jsonRpcError(403, -32000, `Forbidden: origin not allowed`)
    }
    return undefined
  }

  return Object.freeze({ GET: handle, POST: handle, DELETE: handle })
}

function normalizeAuth(
  value: McpRouteOptions['auth'] | undefined,
  fail: (message: string) => never
): readonly AuthFn[] {
  if (value === undefined || value === null) {
    return fail(
      '`auth` is required. Use `localDev()` while developing, or `none()` to serve the public on purpose.'
    )
  }
  const list = Array.isArray(value) ? [...value] : [value as AuthFn]
  if (list.length === 0) {
    return fail(
      '`auth` must not be empty. Use `none()` to serve the public on purpose.'
    )
  }
  for (const entry of list) {
    if (typeof entry !== 'function') {
      fail('every `auth` entry must be an AuthFn, such as `localDev()`.')
    }
  }
  return Object.freeze(list)
}

function jsonRpcError(status: number, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code, message }, id: null },
    { status, headers: { 'cache-control': 'no-store' } }
  )
}
