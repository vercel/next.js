/**
 * Tool error envelope and exception sanitization.
 *
 * Adapted from vercel/eve (Apache-2.0, see ./LICENSE):
 *   packages/eve/src/internal/mcp/streamable-http-server.ts
 * at commit 4f326324524bf15fc9657df5f41e1506f206fffa.
 *
 * Changes from upstream: only the codes `@next/mcp` produces in v1 are kept,
 * and error ids are generated locally instead of by eve's logger.
 */

/**
 * Stable, client-actionable reason a tool call did not produce a result.
 *
 * - `invalid_input`: the arguments failed the input schema.
 * - `denied`: an approval policy denied the call.
 * - `approval_required`: the policy needs a person, which MCP cannot ask.
 * - `internal`: the tool threw; `errorId` correlates with server logs.
 */
export type ToolErrorCode =
  | 'invalid_input'
  | 'denied'
  | 'approval_required'
  | 'internal'

export interface ToolErrorData {
  readonly code: ToolErrorCode
  readonly errorId?: string
  readonly message: string
  readonly retryable: boolean
}

export interface ToolErrorEnvelope {
  readonly error: ToolErrorData
}

export interface McpCallToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[]
  readonly isError?: boolean
  readonly structuredContent?: unknown
}

/** @internal Thrown inside the pipeline to produce a structured error result. */
export class ToolOperationError extends Error {
  readonly code: Exclude<ToolErrorCode, 'internal'>

  constructor(code: Exclude<ToolErrorCode, 'internal'>, message: string) {
    super(message)
    this.name = 'ToolOperationError'
    this.code = code
  }
}

export const INTERNAL_TOOL_ERROR_MESSAGE =
  'The server could not complete this tool call.'

/** @internal */
export function toolError(error: ToolErrorData): McpCallToolResult {
  const text =
    error.errorId === undefined
      ? error.message
      : `${error.message} (errorId: ${error.errorId})`
  // The SDK skips outputSchema validation when isError is set, so this shape
  // does not need to appear in each tool's declared output schema.
  return {
    content: [{ type: 'text', text }],
    isError: true,
    structuredContent: { error } satisfies ToolErrorEnvelope,
  }
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** @internal A short, log-searchable id for one failure. */
export function createErrorId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const byte of bytes) id += CROCKFORD[byte & 31]
  return id
}

/**
 * Logs an unexpected failure with a fresh id and returns the id. The message
 * of the original error never reaches the client: it may carry provider
 * responses, hostnames, or payloads.
 *
 * @internal
 */
export function logUnexpectedError(context: string, error: unknown): string {
  const errorId = createErrorId()
  console.error(`[@next/mcp] ${context} (errorId: ${errorId})`, error)
  return errorId
}
