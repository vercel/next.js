# `@next/mcp`

> **Experimental.** The API may change between canary releases.

Turn an ordinary App Router `route.ts` into a secure, stateless [MCP](https://modelcontextprotocol.io) server that Claude Code, ChatGPT, and other MCP clients can connect to.

- **Routing** is a normal `route.ts`. No special file names, no compiler changes.
- **Protocol and transport** come from the reference SDK, [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server).
- **Auth is required.** There is no default; public servers say so with `none()`.
- **Tools are explicit.** Import them, or collect a directory with `import.meta.glob` (Turbopack).
- **Tool files are source-compatible with [eve](https://eve.dev)** `agent/tools/*.ts` for tools that only use the core context.

## Quick start

```ts filename="app/mcp/tools/roll_dice.ts"
import { defineTool } from '@next/mcp/tools'
import { z } from 'zod'

export default defineTool({
  description: 'Roll an N-sided die.',
  inputSchema: z.object({ sides: z.number().int().min(2).max(1000) }),
  outputSchema: z.object({ value: z.number().int() }),
  execute: ({ sides }) => ({ value: 1 + Math.floor(Math.random() * sides) }),
})
```

```ts filename="app/mcp/route.ts"
import { mcpRoute } from '@next/mcp'
import { localDev } from '@next/mcp/auth'
import roll_dice from './tools/roll_dice'

export const { GET, POST, DELETE } = mcpRoute({
  name: 'dice',
  version: '0.1.0',
  auth: localDev(),
  tools: { roll_dice },
})
```

```bash
claude mcp add --transport http dice http://localhost:3000/mcp
```

`localDev()` accepts local callers under `next dev` and rejects everything in production, so deploying this unchanged answers 401 to every request. To serve the public on purpose, write `auth: none()`.

Schemas can be Zod 4.2+, any [Standard Schema](https://standardschema.dev) that can produce JSON Schema, or a plain JSON Schema object.

## Collecting a directory of tools

With Turbopack (the default bundler), collect every file in a directory. Each file's default export is a tool named after its file:

```ts filename="app/mcp/route.ts"
import { mcpRoute, toolsFromGlob } from '@next/mcp'
import { localDev } from '@next/mcp/auth'

export const { GET, POST, DELETE } = mcpRoute({
  name: 'assistant',
  version: '1.0.0',
  auth: localDev(),
  tools: toolsFromGlob(import.meta.glob('./tools/*.ts', { eager: true })),
})
```

`./tools/get_weather.ts` becomes the tool `get_weather`. Two files with the same name in different directories are an error. With webpack, import tools explicitly.

## Authentication

`auth` takes one `AuthFn` or an ordered list. The first function that returns an identity wins; returning `null` skips to the next one; if all skip, the route answers 401.

```ts
type AuthFn = (
  request: Request
) =>
  | SessionAuthContext
  | null
  | undefined
  | Promise<SessionAuthContext | null | undefined>

interface SessionAuthContext {
  readonly principalId: string
  readonly principalType: string // "user", "service", ...
  readonly authenticator: string // "authjs", "jwt", ...
  readonly issuer?: string
  readonly subject?: string
  readonly attributes: Readonly<Record<string, string | readonly string[]>>
}
```

| Export                                   | Behavior                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `localDev()`                             | Accepts local callers under `next dev`. Skips in every production build.                                 |
| `none()`                                 | Accepts everyone anonymously (`current: null`). Logs a warning when the route loads.                     |
| `extractBearerToken(header)`             | Parses `Authorization: Bearer <token>`. Throws a 401 on empty, malformed, or repeated headers.           |
| `UnauthenticatedError`, `ForbiddenError` | Throw from an `AuthFn` to answer 401 / 403. Pass `{ error: "invalid_token" }` for an RFC 6750 challenge. |

A custom `AuthFn` can verify JWTs from an identity provider:

```ts filename="lib/mcp-jwt.ts"
import { createRemoteJWKSet, jwtVerify } from 'jose'
import {
  extractBearerToken,
  UnauthenticatedError,
  type AuthFn,
} from '@next/mcp/auth'

const ISSUER = 'https://auth.example.com'
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))

export function idpJwt(audience: string): AuthFn {
  return async (request) => {
    const header = request.headers.get('authorization')
    if (!header) return null // no credential: let the next strategy try
    const token = extractBearerToken(header) // throws on malformed headers
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: ISSUER,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'sub'],
      })
      return {
        principalId: payload.sub!,
        principalType: 'user',
        authenticator: 'jwt',
        issuer: ISSUER,
        subject: payload.sub,
        attributes: {},
      }
    } catch {
      throw new UnauthenticatedError({ error: 'invalid_token' })
    }
  }
}
```

## Tools

`defineTool` has the same shape as eve's. Fields that only make sense for agents (`label`, `endsTurn`, `deferred`, `availableInSubagents`, `toModelOutput`) are accepted and ignored, so eve tool files load unchanged apart from the import.

| Field                 | Notes                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `description`         | Required.                                                                                                                               |
| `inputSchema`         | Required. Must describe an object; use `z.object({})` for no input.                                                                     |
| `outputSchema`        | Optional. When set, results carry `structuredContent`.                                                                                  |
| `execute(input, ctx)` | Sync, async, or an async generator (only the final value is returned).                                                                  |
| `approval`            | Optional policy. A denial returns `denied`; a policy that needs a person returns `approval_required`. Either way the tool does not run. |

The context is a strict subset of eve's `ToolContext`:

```ts
interface ToolContext {
  readonly abortSignal: AbortSignal // aborted when the client cancels or the request ends
  readonly callId: string // JSON-RPC request id, stringified
  readonly toolName: string
  readonly session: {
    readonly auth: { readonly current: SessionAuthContext | null } // null only under none()
  }
}
```

The caller's raw credential is never in `ctx`: tools must not forward the caller's token to other services.

Tools run inside the route's request context, so `after()`, `revalidatePath()`, and `revalidateTag()` work. **Do not call `cookies()` in a tool**: it reads whatever browser session accompanies the request, which can be a different identity than the authenticated caller. Use `ctx.session.auth.current`. The `@next/next/no-cookies-in-mcp-tools` ESLint rule enforces this.

### Errors

A tool that throws never leaks its message. Clients get a stable code and an `errorId` that matches the server log:

```json
{
  "content": [
    {
      "type": "text",
      "text": "The server could not complete this tool call. (errorId: 01JC9X3Q8T)"
    }
  ],
  "isError": true,
  "structuredContent": {
    "error": {
      "code": "internal",
      "errorId": "01JC9X3Q8T",
      "message": "The server could not complete this tool call.",
      "retryable": false
    }
  }
}
```

| Code                | When                                       |
| ------------------- | ------------------------------------------ |
| `invalid_input`     | Arguments failed the input schema.         |
| `denied`            | An approval policy denied the call.        |
| `approval_required` | The policy needs a person; MCP cannot ask. |
| `internal`          | The tool threw.                            |

## Request pipeline

Every request passes these checks in order; the first failure answers.

1. **Host** must be the canonical host or one of `allowedHosts`.
2. **Origin**, when present, must exactly match an allowed origin (default: the canonical origin; loopback is added under `next dev`). `null` and unparseable values are rejected. Non-browser clients send no `Origin` and pass.
3. **Auth** walks the `auth` list.
4. A fresh MCP server is built for the caller and the SDK dispatches the request. POST bodies over `maxRequestBodySize` (default 1 MiB) are rejected with 413.

The route reads the request first, so it is always dynamic and never prerendered.

## Canonical URL

The public URL is resolved when the module loads, never from request headers:

1. The `url` option.
2. Under `next dev`, `http://localhost:$PORT`.
3. On Vercel, the preview branch URL for previews and `VERCEL_PROJECT_PRODUCTION_URL` for production. Vercel's own deployment URLs are also accepted as hosts.
4. Otherwise, loading the route throws, which fails `next build`. Pass `url` when self-hosting.

## `mcpRoute` options

| Option               | Type                   | Default          |
| -------------------- | ---------------------- | ---------------- |
| `name`               | `string`               | required         |
| `version`            | `string`               | required         |
| `auth`               | `AuthFn \| AuthFn[]`   | required         |
| `tools`              | `Record<string, Tool>` | required         |
| `instructions`       | `string`               | none             |
| `url`                | `string`               | resolved         |
| `allowedOrigins`     | `string[]`             | canonical origin |
| `allowedHosts`       | `string[]`             | canonical host   |
| `maxRequestBodySize` | `number`               | `1_048_576`      |

Invalid options, invalid tool names, values that are not `defineTool` results, and schemas that cannot produce JSON Schema all throw when the module loads.

## Not in this version

- OAuth protected-resource metadata (RFC 9728) and shared OIDC strategies.
- Per-tool authorization and `tools/list` filtering.
- Stateful sessions, subscriptions, prompts, and resources.

## License

MIT. Includes code adapted from [eve](https://github.com/vercel/eve) under the Apache License 2.0; see `NOTICE`.
