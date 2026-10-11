/** File-level diagnostics outlive C's sealed case results. */
export function createLateFailureSink(report: (error: Error) => Promise<void>) {
  const errors = new Set<Error>()
  const pending: Promise<void>[] = []
  const reportingErrors: unknown[] = []
  return {
    get failed() {
      return errors.size > 0
    },
    has(error: unknown) {
      return errors.has(error as Error)
    },
    report(error: Error) {
      if (errors.has(error)) return
      // Mark failure synchronously, even if the test catches the thrown error.
      errors.add(error)
      pending.push(
        Promise.resolve()
          .then(() => report(error))
          .catch((reportingError) => {
            reportingErrors.push(reportingError)
          })
      )
    },
    async flush() {
      // Array iteration also visits diagnostics appended while a send is pending.
      for (const diagnostic of pending) await diagnostic
      if (reportingErrors.length === 1) throw reportingErrors[0]
      if (reportingErrors.length > 1) {
        throw new AggregateError(
          reportingErrors,
          'Late failure reporting failed'
        )
      }
    },
  }
}
