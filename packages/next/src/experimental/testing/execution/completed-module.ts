import { isDeepStrictEqual } from 'node:util'
import type { CompletedModuleResult } from '../runner/lifecycle'
import type { ResultStatus } from '../reporting/events'

export interface ModuleExecutionIdentity {
  version: 1
  runId: string
  entryId: string
  revision: string
}

/** Private terminal runtime data. No publication or scheduling baseline rights. */
export type RuntimeModuleCompletion = ModuleExecutionIdentity &
  (
    | (Omit<CompletedModuleResult, 'version'> & {
        kind: 'fulfilled'
        resultVersion: CompletedModuleResult['version']
      })
    | {
        kind: 'unavailable'
        phase: 'load' | 'collection' | 'run'
        /** The same serialized original failure already sent on this owner. */
        failure: unknown
      }
  )

/** The direct execution owner alone determines closure after all cleanup joins. */
export type ModuleExecutionResult =
  | { closed: true; completion: RuntimeModuleCompletion }
  | { closed: false; completion?: RuntimeModuleCompletion }

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function assertRuntimeModuleCompletion(
  value: unknown,
  identity: ModuleExecutionIdentity,
  status: ResultStatus,
  observedFailures: readonly unknown[]
): asserts value is RuntimeModuleCompletion {
  if (
    !record(value) ||
    value.version !== 1 ||
    value.runId !== identity.runId ||
    value.entryId !== identity.entryId ||
    value.revision !== identity.revision
  )
    throw new Error('Invalid private module completion identity.')
  if (value.kind === 'fulfilled') {
    if (
      value.resultVersion !== 2 ||
      ![null, 'pass', 'fail', 'skip', 'todo'].includes(
        value.finalState as any
      ) ||
      typeof value.durationMs !== 'number' ||
      !Number.isFinite(value.durationMs) ||
      value.durationMs < 0 ||
      typeof value.containsOnly !== 'boolean' ||
      typeof value.interrupted !== 'boolean' ||
      Object.keys(value).length !== 10
    )
      throw new Error('Invalid fulfilled private module completion.')
  } else if (value.kind === 'unavailable') {
    if (
      !['load', 'collection', 'run'].includes(String(value.phase)) ||
      !Object.hasOwn(value, 'failure') ||
      Object.keys(value).length !== 7 ||
      status !== 'failed' ||
      !observedFailures.some((failure) =>
        isDeepStrictEqual(failure, value.failure)
      )
    )
      throw new Error('Uncorroborated unavailable private module completion.')
  } else throw new Error('Unknown private module completion kind.')
}
