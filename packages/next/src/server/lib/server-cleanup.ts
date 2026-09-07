export type ServerCleanupStage = () => void | PromiseLike<void>

/** Flattens AggregateErrors in declaration order while preserving identity. */
export function addDistinctServerCleanupFailures(
  target: unknown[],
  error: unknown
): void {
  const distinct = new Set(target)
  const active = new Set<AggregateError>()

  const visit = (failure: unknown) => {
    if (failure instanceof AggregateError) {
      if (active.has(failure)) {
        if (!distinct.has(failure)) {
          distinct.add(failure)
          target.push(failure)
        }
        return
      }

      let nested: unknown[]
      try {
        nested = Array.from(failure.errors)
      } catch {
        nested = []
      }
      if (nested.length > 0) {
        const previousLength = target.length
        active.add(failure)
        for (const value of nested) visit(value)
        active.delete(failure)
        if (target.length !== previousLength) return
      }
    }

    if (!distinct.has(failure)) {
      distinct.add(failure)
      target.push(failure)
    }
  }

  visit(error)
}

/** A termination signal overrides a restart which is already draining. */
export function latchServerCleanupExitCode(
  current: number | undefined,
  requested: number
): number {
  return current === undefined || requested === 130 || requested === 143
    ? requested
    : current
}

/** Starts cleanup after the current request/listener callback can return. */
export function scheduleServerCleanup(cleanup: () => Promise<void>): void {
  setTimeout(() => {
    void cleanup().catch(console.error)
  }, 0)
}

/** Runs ordered cleanup phases while attempting every stage in each phase. */
export async function runServerCleanupPhases(
  phases: ReadonlyArray<ReadonlyArray<ServerCleanupStage>>,
  onFailure: (error: unknown) => void = (error) => console.error(error)
): Promise<void> {
  for (const phase of phases) {
    const results = await Promise.allSettled(
      phase.map(async (stage) => stage())
    )
    for (const result of results) {
      if (result.status !== 'rejected') continue
      try {
        onFailure(result.reason)
      } catch {
        // Diagnostics must not acquire ownership of process cleanup.
      }
    }
  }
}
