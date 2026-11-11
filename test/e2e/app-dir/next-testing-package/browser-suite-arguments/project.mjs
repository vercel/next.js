import { observedTaskIdentities } from './suite-identities.mjs'
/** Stable authored and lifecycle facts; raw reports retain Ready, IDs and timing. */
export function projectCleanupReport(report, trace, exit) {
  const ids = observedTaskIdentities(trace.files)
  return {
    rows: trace.records
      .filter((event) => event.hook === 'console')
      .flatMap((event) =>
        event.log.content
          .split('\n')
          .filter((line) => line.startsWith('BROWSER_NATIVE_FIXTURE:'))
          .map((line) => ({
            value: JSON.parse(line.slice('BROWSER_NATIVE_FIXTURE:'.length)),
            task: ids.get(event.log.taskId) ?? event.log.taskId,
          }))
      ),
    cases: report.testResults
      .flatMap((file) => file.assertionResults)
      .map((test) => ({
        name: test.fullName,
        status: test.status,
        failureMessages: test.failureMessages,
      })),
    caseFinals: trace.records
      .filter((event) => event.hook === 'case')
      .map((event) => ({ name: event.name, result: event.result })),
    moduleFinals: trace.records
      .filter((event) => event.hook === 'module')
      .map((event) => ({ state: event.state, errors: event.errors })),
    runFinals: trace.records
      .filter((event) => event.hook === 'end')
      .map((event) => ({
        reason: event.reason,
        errors: event.errors,
        rawUnhandled: event.rawUnhandled,
        files: event.files.map((file) => ({
          state: file.state,
          tests: file.tests.map((test) => ({
            name: test.name,
            result: test.result,
          })),
        })),
      })),
    standardFiles: report.testResults.map((file) => ({
      status: file.status,
      message: file.message,
    })),
    counts: Object.fromEntries(
      Object.entries(report).filter(([key]) => key.startsWith('num'))
    ),
    success: report.success,
    exit,
  }
}
