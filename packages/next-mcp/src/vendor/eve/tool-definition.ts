/**
 * Tool definitions, in the same shape as eve's `defineTool`.
 *
 * Adapted from vercel/eve (Apache-2.0, see ./LICENSE):
 *   packages/eve/src/tools/definition.ts
 *   packages/eve/src/approval/definition.ts
 *   packages/eve/src/approval/status.ts
 * at commit 4f326324524bf15fc9657df5f41e1506f206fffa.
 *
 * Changes from upstream:
 * - `ToolContext` is the strict subset of eve's context that an MCP server
 *   can provide: `abortSignal`, `callId`, `toolName`, and `session.auth`.
 *   A tool that reaches for agent-only context (`ctx.getSandbox()`, ...)
 *   fails to type-check, which is the intended portability signal.
 * - Agent-only fields (`label`, `endsTurn`, `deferred`,
 *   `availableInSubagents`, `toModelOutput`) are accepted and ignored.
 * - Approval policies receive the same subset of context.
 *
 * The brand is shared with eve (`Symbol.for("eve:tool-brand")`), so a tool
 * built with eve's own `defineTool` is accepted as well.
 */

import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'

import type { SessionAuthContext } from './auth'

/** A JSON object, as used for plain JSON Schema definitions. */
export type JsonObject = { readonly [key: string]: unknown }

/** @internal Shared with eve so either package's `defineTool` is accepted. */
export const TOOL_BRAND = Symbol.for('eve:tool-brand')

/** @internal */
export function isDefinedTool(value: unknown): value is ToolDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[TOOL_BRAND] === true
  )
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** The caller's verified identity, as seen by tools and approval policies. */
export interface ToolSession {
  readonly auth: {
    /**
     * The identity the route's `auth` list accepted. `null` only when the
     * route accepted the request through `none()`.
     */
    readonly current: SessionAuthContext | null
  }
}

/**
 * Context passed as the second argument to `execute`. A strict subset of
 * eve's `ToolContext`, with identical field names.
 *
 * The caller's raw credential is deliberately absent: tools must not forward
 * the caller's token to other services.
 */
export interface ToolContext {
  /** Aborted when the client cancels the call or the request ends. */
  readonly abortSignal: AbortSignal
  /** The JSON-RPC request id of this call, stringified. */
  readonly callId: string
  /** The name this tool is registered under. */
  readonly toolName: string
  readonly session: ToolSession
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export type ApprovalToolInput<TInput> = TInput extends object
  ? Readonly<TInput>
  : TInput

/** Context passed to an {@link ApprovalPolicy}. */
export interface ApprovalContext<TInput = Record<string, unknown>> {
  readonly abortSignal: AbortSignal
  readonly callId: string
  readonly toolName: string
  readonly toolInput?: ApprovalToolInput<TInput>
  readonly session: ToolSession
}

/**
 * Request-time approval decision.
 *
 * - `undefined`, `false`, `"not-applicable"`, `"approved"`: the call runs.
 * - `"denied"`: the call is rejected with a `denied` error.
 * - `true`, `"user-approval"`: the call needs a person's approval. An MCP
 *   server cannot ask for it, so the call is rejected with
 *   `approval_required`.
 */
export type ApprovalStatus =
  | undefined
  | boolean
  | 'not-applicable'
  | 'approved'
  | 'denied'
  | 'user-approval'
  | { readonly type: 'not-applicable'; readonly reason?: never }
  | { readonly type: 'approved'; readonly reason?: string }
  | { readonly type: 'denied'; readonly reason?: string }
  | { readonly type: 'user-approval'; readonly reason?: never }

export type ApprovalPolicy<TInput = Record<string, unknown>> = (
  ctx: ApprovalContext<TInput>
) => ApprovalStatus | Promise<ApprovalStatus>

export interface ApprovalConfiguration<TInput = Record<string, unknown>> {
  /** Accepted for eve compatibility; unused, since no person is asked. */
  readonly prompt?: (context: {
    readonly callId: string
    readonly input: TInput
    readonly toolName: string
  }) => string
  readonly request: ApprovalPolicy<TInput>
  /** Accepted for eve compatibility; unused, since no person is asked. */
  readonly response?: (...args: never[]) => unknown
}

export type Approval<TInput = Record<string, unknown>> =
  | ApprovalPolicy<TInput>
  | ApprovalConfiguration<TInput>

/** @internal */
export interface ApprovalDecision {
  readonly denied: boolean
  readonly awaitsPerson?: true
  readonly reason?: string
}

/** @internal Normalizes a policy's return value, rejecting malformed ones. */
export function approvalDecision(value: unknown): ApprovalDecision {
  if (value === undefined || value === false) return { denied: false }
  if (value === true) return { denied: false, awaitsPerson: true }
  const type =
    typeof value === 'object' && value !== null
      ? Reflect.get(value, 'type')
      : value
  if (
    type !== 'not-applicable' &&
    type !== 'approved' &&
    type !== 'denied' &&
    type !== 'user-approval'
  ) {
    throw new Error(
      'An approval policy must return an approval status, a boolean, or undefined.'
    )
  }
  const reason: unknown =
    typeof value === 'object' && value !== null
      ? Reflect.get(value, 'reason')
      : undefined
  if (
    reason !== undefined &&
    (typeof reason !== 'string' || (type !== 'approved' && type !== 'denied'))
  ) {
    throw new Error(
      'Only approved and denied approval statuses accept a string reason.'
    )
  }
  if (type === 'user-approval') return { denied: false, awaitsPerson: true }
  if (type === 'denied')
    return reason === undefined
      ? { denied: true }
      : { denied: true, reason: reason as string }
  return { denied: false }
}

/** @internal */
export function resolveApprovalPolicy(
  approval: Approval<never>
): ApprovalPolicy<never> {
  return typeof approval === 'function' ? approval : approval.request
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export type PublicToolInputSchema<TInput = unknown> =
  | StandardSchemaV1<unknown, TInput>
  | StandardJSONSchemaV1<unknown, TInput>
  | JsonObject

export type PublicToolOutputSchema<TOutput = unknown> =
  | StandardJSONSchemaV1<unknown, TOutput>
  | JsonObject

// `any` passes through so `ToolDefinition<any, any>` stays the type every defined tool fits.
type ApprovalContextInput<TInput> = 0 extends 1 & TInput
  ? TInput
  : unknown extends TInput
    ? Record<string, unknown>
    : TInput

/** Fields eve uses for agents. Accepted so eve tool files load; ignored. */
interface AgentOnlyToolFields<TInput, TOutput> {
  readonly availableInSubagents?: boolean
  readonly deferred?: boolean
  label?: {
    start(input: Readonly<TInput>): string
    delta?(input: Readonly<TInput>, partial: Readonly<TOutput>): string
    complete?(input: Readonly<TInput>, output: Readonly<TOutput>): string
  }
  endsTurn?: boolean | ((output: TOutput) => boolean | Promise<boolean>)
  toModelOutput?: (output: TOutput) => unknown
}

/** A tool, as authored in a tool file and served by `mcpRoute`. */
export interface ToolDefinition<TInput = unknown, TOutput = unknown>
  extends AgentOnlyToolFields<TInput, TOutput> {
  /** What the tool does, shown to the connecting model. Required. */
  readonly description: string
  /**
   * Zod, any Standard Schema that can produce JSON Schema, or a plain JSON
   * Schema object. Use `z.object({})` for a tool without input.
   */
  inputSchema: PublicToolInputSchema<TInput>
  /** When set, results also carry `structuredContent`. */
  outputSchema?: PublicToolOutputSchema<TOutput>
  /**
   * Runs the tool. May be sync, async, or an async generator, in which case
   * only the final yielded value is returned to the client.
   */
  execute(
    input: TInput,
    ctx: ToolContext
  ): Promise<TOutput> | TOutput | AsyncIterable<TOutput>
  /**
   * Optional approval policy. A denial rejects the call with `denied`; a
   * policy that needs a person rejects it with `approval_required`. In both
   * cases `execute` does not run.
   */
  approval?: Approval<ApprovalContextInput<TInput>>
}

/**
 * Any tool built with `defineTool`, whatever its input and output types.
 * `ToolDefinition<any, any>` is not enough: agent-only fields such as
 * `label.delta(input, partial: Readonly<TOutput>)` make a tool whose output is
 * a string incompatible with `Readonly<any>`. `mcpRoute` validates the rest
 * when the module loads.
 */
export interface AnyToolDefinition {
  readonly description: string
  execute(input: never, ctx: ToolContext): unknown
}

type ToolOutputFromExecuteReturn<TReturn> =
  TReturn extends Promise<infer TOutput>
    ? TOutput
    : TReturn extends AsyncIterable<infer TOutput>
      ? TOutput
      : TReturn

type ToolDefinitionWithExecuteReturn<TInput, TOutput, TReturn> = ToolDefinition<
  TInput,
  TOutput
> & {
  execute(input: TInput, ctx: ToolContext): TReturn
}

type AgentOnly<TInput, TOutput> = {
  availableInSubagents?: boolean
  deferred?: boolean
  label?: ToolDefinition<TInput, TOutput>['label']
  endsTurn?: ToolDefinition<TInput, TOutput>['endsTurn']
  toModelOutput?: ToolDefinition<TInput, TOutput>['toModelOutput']
}

/**
 * Defines a tool. Same shape and intent as eve's `defineTool`: the tool's
 * name is not part of the definition, it comes from the key in `mcpRoute`'s
 * `tools` record (or the file name, with `toolsFromGlob`).
 */
export function defineTool<
  TInputSchema extends
    | StandardSchemaV1<unknown, unknown>
    | StandardJSONSchemaV1<unknown, unknown>,
  TOutputSchema extends StandardJSONSchemaV1<unknown, unknown>,
  TReturn extends
    | Promise<StandardJSONSchemaV1.InferOutput<TOutputSchema>>
    | StandardJSONSchemaV1.InferOutput<TOutputSchema>
    | AsyncIterable<StandardJSONSchemaV1.InferOutput<TOutputSchema>>,
>(
  definition: {
    description: string
    inputSchema: TInputSchema
    outputSchema: TOutputSchema
    execute(
      input: StandardSchemaV1.InferOutput<TInputSchema>,
      ctx: ToolContext
    ): TReturn
    approval?: ToolDefinition<
      StandardSchemaV1.InferOutput<TInputSchema>,
      unknown
    >['approval']
  } & AgentOnly<
    StandardSchemaV1.InferOutput<TInputSchema>,
    StandardJSONSchemaV1.InferOutput<TOutputSchema>
  >
): ToolDefinitionWithExecuteReturn<
  StandardSchemaV1.InferOutput<TInputSchema>,
  StandardJSONSchemaV1.InferOutput<TOutputSchema>,
  TReturn
>
export function defineTool<
  TSchema extends
    | StandardSchemaV1<unknown, unknown>
    | StandardJSONSchemaV1<unknown, unknown>,
  TReturn,
>(
  definition: {
    description: string
    inputSchema: TSchema
    outputSchema?: JsonObject
    execute(
      input: StandardSchemaV1.InferOutput<TSchema>,
      ctx: ToolContext
    ): TReturn
    approval?: ToolDefinition<
      StandardSchemaV1.InferOutput<TSchema>,
      unknown
    >['approval']
  } & AgentOnly<
    StandardSchemaV1.InferOutput<TSchema>,
    ToolOutputFromExecuteReturn<TReturn>
  >
): ToolDefinitionWithExecuteReturn<
  StandardSchemaV1.InferOutput<TSchema>,
  ToolOutputFromExecuteReturn<TReturn>,
  TReturn
>
export function defineTool<
  TOutputSchema extends StandardJSONSchemaV1<unknown, unknown>,
  TReturn extends
    | Promise<StandardJSONSchemaV1.InferOutput<TOutputSchema>>
    | StandardJSONSchemaV1.InferOutput<TOutputSchema>
    | AsyncIterable<StandardJSONSchemaV1.InferOutput<TOutputSchema>>,
>(
  definition: {
    description: string
    inputSchema: JsonObject
    outputSchema: TOutputSchema
    execute(input: Record<string, unknown>, ctx: ToolContext): TReturn
    approval?: ToolDefinition<Record<string, unknown>, unknown>['approval']
  } & AgentOnly<
    Record<string, unknown>,
    StandardJSONSchemaV1.InferOutput<TOutputSchema>
  >
): ToolDefinitionWithExecuteReturn<
  Record<string, unknown>,
  StandardJSONSchemaV1.InferOutput<TOutputSchema>,
  TReturn
>
export function defineTool<TReturn>(
  definition: {
    description: string
    inputSchema: JsonObject
    outputSchema?: JsonObject
    execute(input: Record<string, unknown>, ctx: ToolContext): TReturn
    approval?: ToolDefinition<Record<string, unknown>, unknown>['approval']
  } & AgentOnly<Record<string, unknown>, ToolOutputFromExecuteReturn<TReturn>>
): ToolDefinitionWithExecuteReturn<
  Record<string, unknown>,
  ToolOutputFromExecuteReturn<TReturn>,
  TReturn
>
export function defineTool<TInput = unknown, TOutput = unknown>(
  definition: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput>
export function defineTool<TInput = unknown, TOutput = unknown>(
  definition: ToolDefinition<TInput, TOutput>
): ToolDefinition<TInput, TOutput> {
  if (typeof definition !== 'object' || definition === null) {
    throw new TypeError('defineTool: expected a tool definition object.')
  }
  Object.defineProperty(definition, TOOL_BRAND, { value: true })
  return definition
}
