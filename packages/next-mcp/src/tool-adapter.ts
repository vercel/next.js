import {
  fromJsonSchema,
  type McpServer,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server'
import type { StandardSchemaV1 } from '@standard-schema/spec'

import type { SessionAuthContext } from './vendor/eve/auth'
import {
  approvalDecision,
  isDefinedTool,
  resolveApprovalPolicy,
  type ApprovalContext,
  type ToolContext,
  type ToolDefinition,
} from './vendor/eve/tool-definition'
import {
  INTERNAL_TOOL_ERROR_MESSAGE,
  logUnexpectedError,
  toolError,
  ToolOperationError,
  type McpCallToolResult,
} from './vendor/eve/tool-errors'

/**
 * MCP tool name rules (SEP-986): 1–128 characters from A–Z, a–z, 0–9, `_`,
 * `-`, and `.`.
 */
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/

const JSON_SCHEMA_TARGET = 'draft-2020-12'

/** A tool validated and converted once, when the route module loads. */
export interface PreparedTool {
  readonly name: string
  readonly definition: ToolDefinition<unknown, unknown>
  readonly inputValidator: StandardSchemaV1['~standard']
  readonly advertisedInputSchema: StandardSchemaWithJSON
  readonly outputSchema: StandardSchemaWithJSON | undefined
}

type StandardLike = {
  readonly '~standard': {
    readonly validate?: StandardSchemaV1['~standard']['validate']
    readonly jsonSchema?: {
      readonly input: (options: { target: string }) => Record<string, unknown>
      readonly output: (options: { target: string }) => Record<string, unknown>
    }
    readonly vendor: string
    readonly version: 1
  }
}

function isStandardLike(value: unknown): value is StandardLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)['~standard'] === 'object'
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Validates one `tools` entry and converts its schemas. Throws a descriptive
 * error, which surfaces as a `next build` failure because route modules are
 * loaded while collecting page data.
 */
export function prepareTool(
  routeName: string,
  name: string,
  value: unknown
): PreparedTool {
  const fail = (message: string): never => {
    throw new Error(
      `[@next/mcp] mcpRoute("${routeName}"): tool "${name}" ${message}`
    )
  }

  if (!TOOL_NAME.test(name)) {
    fail(
      'has an invalid name. MCP tool names are 1-128 characters of A-Z, a-z, 0-9, "_", "-", or ".".'
    )
  }
  if (!isDefinedTool(value)) {
    fail(
      'is not a tool. Wrap it with `defineTool` from "@next/mcp/tools" and export it as the default export.'
    )
  }
  const definition = value as ToolDefinition<unknown, unknown>
  if (
    typeof definition.description !== 'string' ||
    definition.description.trim() === ''
  ) {
    fail('needs a non-empty `description`.')
  }
  if (typeof definition.execute !== 'function') {
    fail('needs an `execute` function.')
  }

  const input = toInputSchema(definition.inputSchema, fail)
  const outputSchema =
    definition.outputSchema === undefined
      ? undefined
      : toOutputSchema(definition.outputSchema, fail)

  return {
    name,
    definition,
    inputValidator: input['~standard'],
    advertisedInputSchema: advertiseOnly(input),
    outputSchema,
  }
}

function toInputSchema(
  schema: unknown,
  fail: (message: string) => never
): StandardSchemaWithJSON {
  if (schema === undefined) {
    return fail(
      'needs an `inputSchema`. Use `z.object({})` for a tool without input.'
    )
  }
  let standard: StandardSchemaWithJSON
  if (isStandardLike(schema)) {
    const props = schema['~standard']
    if (props.jsonSchema === undefined) {
      return fail(
        `has an \`inputSchema\` (${props.vendor}) that cannot produce JSON Schema. Use a schema library that implements Standard JSON Schema, such as Zod 4.2+, or pass a plain JSON Schema object.`
      )
    }
    if (typeof props.validate !== 'function') {
      // JSON-only standard schema: validate against its JSON Schema.
      standard = fromJsonSchema(jsonSchemaOf(props, 'input', fail))
    } else {
      standard = schema as unknown as StandardSchemaWithJSON
    }
  } else if (isPlainObject(schema)) {
    standard = fromJsonSchema(schema as never)
  } else {
    return fail('has an `inputSchema` that is not a schema.')
  }

  const json = jsonSchemaOf(standard['~standard'], 'input', fail)
  if (json.type !== 'object') {
    fail(
      'has an `inputSchema` that is not an object schema. MCP tool arguments are always an object; use `z.object({...})`.'
    )
  }
  return standard
}

function toOutputSchema(
  schema: unknown,
  fail: (message: string) => never
): StandardSchemaWithJSON {
  if (isStandardLike(schema)) {
    const props = schema['~standard']
    if (props.jsonSchema === undefined) {
      return fail(
        `has an \`outputSchema\` (${props.vendor}) that cannot produce JSON Schema.`
      )
    }
    const json = jsonSchemaOf(props, 'output', fail)
    return typeof props.validate === 'function'
      ? (schema as unknown as StandardSchemaWithJSON)
      : fromJsonSchema(json as never)
  }
  if (isPlainObject(schema)) return fromJsonSchema(schema as never)
  return fail('has an `outputSchema` that is not a schema.')
}

function jsonSchemaOf(
  props: StandardLike['~standard'] | StandardSchemaWithJSON['~standard'],
  direction: 'input' | 'output',
  fail: (message: string) => never
): Record<string, unknown> {
  try {
    const json = (props as StandardLike['~standard']).jsonSchema![direction]({
      target: JSON_SCHEMA_TARGET,
    })
    if (!isPlainObject(json)) throw new Error('not an object')
    return json
  } catch (error) {
    return fail(
      `has an \`${direction}Schema\` that cannot be converted to JSON Schema: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * The SDK both advertises and enforces a tool's input schema, but answers a
 * rejected call with bare text. This copy keeps the advertised JSON Schema and
 * accepts any arguments, so the tool wrapper checks them against the real
 * schema and returns an `invalid_input` error like every other rejection.
 *
 * Adapted from eve's `advertiseOnly` (packages/eve/src/internal/mcp/streamable-http-server.ts).
 */
function advertiseOnly(schema: StandardSchemaWithJSON): StandardSchemaWithJSON {
  const standard = schema['~standard']
  return {
    '~standard': {
      jsonSchema: standard.jsonSchema,
      validate: (value: unknown) => ({ value }),
      vendor: standard.vendor,
      version: standard.version,
    },
  } as StandardSchemaWithJSON
}

function formatIssue(issue: StandardSchemaV1.Issue): string {
  if (issue.path === undefined || issue.path.length === 0) return issue.message
  const path = issue.path
    .map((segment) =>
      String(typeof segment === 'object' ? segment.key : segment)
    )
    .join('.')
  return `${path}: ${issue.message}`
}

/** Registers `tool` on a per-request server for the caller `auth`. */
export function registerTool(
  server: McpServer,
  tool: PreparedTool,
  auth: SessionAuthContext | null,
  request: Request
): void {
  const session = Object.freeze({ auth: Object.freeze({ current: auth }) })
  const hasOutputSchema = tool.outputSchema !== undefined

  server.registerTool(
    tool.name,
    {
      description: tool.definition.description,
      inputSchema: tool.advertisedInputSchema,
      ...(tool.outputSchema === undefined
        ? {}
        : { outputSchema: tool.outputSchema }),
    },
    (async (value: unknown, sdkContext: SdkToolContext) => {
      try {
        const checked = await tool.inputValidator.validate(value)
        if (checked.issues !== undefined) {
          return toolError({
            code: 'invalid_input',
            message: `Invalid arguments for tool ${tool.name}: ${checked.issues
              .map(formatIssue)
              .join(', ')}`,
            retryable: false,
          })
        }

        const abortSignal = combineSignals(
          sdkContext.mcpReq.signal,
          request.signal
        )
        const callId = String(sdkContext.mcpReq.id)

        if (tool.definition.approval !== undefined) {
          await checkApproval(tool, {
            abortSignal,
            callId,
            session,
            toolInput: checked.value as never,
            toolName: tool.name,
          })
        }

        const ctx: ToolContext = Object.freeze({
          abortSignal,
          callId,
          session,
          toolName: tool.name,
        })
        const output = await settle(tool.definition.execute(checked.value, ctx))
        return toCallToolResult(output, hasOutputSchema)
      } catch (error) {
        if (error instanceof ToolOperationError) {
          return toolError({
            code: error.code,
            message: error.message,
            retryable: false,
          })
        }
        const errorId = logUnexpectedError(`tool "${tool.name}" threw`, error)
        return toolError({
          code: 'internal',
          errorId,
          message: INTERNAL_TOOL_ERROR_MESSAGE,
          retryable: false,
        })
      }
    }) as never
  )
}

interface SdkToolContext {
  readonly mcpReq: {
    readonly id: string | number
    readonly signal: AbortSignal
  }
}

async function checkApproval(
  tool: PreparedTool,
  context: ApprovalContext<never>
): Promise<void> {
  const policy = resolveApprovalPolicy(tool.definition.approval!)
  const decision = approvalDecision(await policy(context))
  if (decision.denied) {
    throw new ToolOperationError(
      'denied',
      decision.reason ??
        `The approval policy for "${tool.name}" denied this call.`
    )
  }
  if (decision.awaitsPerson) {
    throw new ToolOperationError(
      'approval_required',
      `The tool "${tool.name}" needs a person's approval, which this MCP server cannot ask for.`
    )
  }
}

/** Resolves `execute`'s result. For an async iterable, keeps the last value. */
async function settle(result: unknown): Promise<unknown> {
  if (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      'function'
  ) {
    let last: unknown
    for await (const value of result as AsyncIterable<unknown>) last = value
    return last
  }
  return await result
}

function toCallToolResult(
  output: unknown,
  hasOutputSchema: boolean
): McpCallToolResult {
  const text =
    typeof output === 'string' ? output : (JSON.stringify(output) ?? 'null')
  const content = [{ type: 'text' as const, text }]
  // A declared outputSchema obliges structured content of any JSON type.
  // Without a schema, only objects are structured.
  return hasOutputSchema || isPlainObject(output)
    ? { content, structuredContent: output ?? null }
    : { content }
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b])
  const controller = new AbortController()
  const abort = (signal: AbortSignal) => controller.abort(signal.reason)
  for (const signal of [a, b]) {
    if (signal.aborted) {
      abort(signal)
      break
    }
    signal.addEventListener('abort', () => abort(signal), { once: true })
  }
  return controller.signal
}
