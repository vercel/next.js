import type { TestProcessExit } from './execution/process'

/** A pending failure can be any thrown value, including undefined. */
export type ConfigFinalExitOutcome =
  | { kind: 'completed' }
  | { kind: 'failed'; exitCode?: number | string }
  | { kind: 'cancelled'; reason: unknown }

export interface PreparedConfigFinalExit {
  /** Authored realm state at the completed close boundary. */
  readonly exitCode: number | string | undefined
  /** An already-settled initial close error, kept separate from later cleanup. */
  readonly initialCloseFailure?: { error: unknown }
  finalize(outcome: ConfigFinalExitOutcome): Promise<TestProcessExit>
}

/** Retain the real realm while its controller joins its remaining resources. */
export function createPreparedConfigFinalExit(options: {
  exitCode?: number | string
  initialCloseFailure?: { error: unknown }
  request(message: object): Promise<unknown>
  exit: Promise<TestProcessExit>
  isClosed(): boolean
  abort(reason: unknown): void
}): PreparedConfigFinalExit {
  let finishing: Promise<TestProcessExit> | undefined
  return {
    exitCode: options.exitCode,
    ...(options.initialCloseFailure
      ? { initialCloseFailure: options.initialCloseFailure }
      : {}),
    finalize(outcome) {
      return (finishing ??= (async () => {
        if (outcome.kind === 'cancelled') {
          options.abort(outcome.reason)
          return options.exit
        }
        if (options.isClosed()) return options.exit
        // Completed cleanup does not rewrite a later authored realm change.
        const selected =
          outcome.kind === 'failed' ? (outcome.exitCode ?? 1) : undefined
        const exitCode =
          selected !== undefined && Number(selected) === 0 ? 1 : selected
        try {
          await options.request({
            type: 'finalize-process-exit',
            ...(outcome.kind === 'failed' ? { exitCode } : {}),
          })
        } catch (error) {
          // Native authored failure can close the realm while the controller is
          // still cleaning up. Its actual status and stderr remain authoritative.
          if (options.isClosed()) return options.exit
          options.abort(error)
          await options.exit.catch(() => {})
          throw error
        }
        return options.exit
      })())
    },
  }
}
