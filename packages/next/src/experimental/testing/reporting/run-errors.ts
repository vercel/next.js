import type {
  CaseResult,
  FileResult,
  ResultEvent,
  SerializedDiagnostic,
  SuiteResult,
} from './events'

export function isBrowserCleanupRunError(diagnostic: SerializedDiagnostic) {
  return (
    diagnostic.runError === 'browser-worker-fixture-cleanup' ||
    diagnostic.runError === 'browser-component-cleanup'
  )
}

export function isRunErrorDiagnostic(diagnostic: SerializedDiagnostic) {
  return (
    diagnostic.unhandled === 'rejection' || isBrowserCleanupRunError(diagnostic)
  )
}

export function reportedRunError(diagnostic: SerializedDiagnostic) {
  if (!isBrowserCleanupRunError(diagnostic)) return diagnostic
  return {
    name: diagnostic.name,
    message: diagnostic.message,
    stack: diagnostic.stack,
    stacks: diagnostic.frames ?? [],
    type: 'Cleanup Error',
  }
}

export function hasOnlyBrowserCleanupFailures(
  entryId: string,
  completion: {
    events: readonly ResultEvent[]
    files: readonly FileResult[]
    cases: readonly CaseResult[]
    suites: readonly SuiteResult[]
  }
) {
  const diagnostics = completion.events.filter(
    (event) =>
      event.type === 'diagnostic' &&
      event.entryId === entryId &&
      event.diagnostic.severity === 'error'
  )
  return (
    completion.files.find((file) => file.entryId === entryId)?.status ===
      'failed' &&
    diagnostics.length > 0 &&
    diagnostics.every(
      (event) =>
        event.type === 'diagnostic' &&
        isBrowserCleanupRunError(event.diagnostic)
    ) &&
    !completion.cases.some(
      (test) =>
        test.entryId === entryId &&
        (test.status === 'failed' || test.status === 'cancelled')
    ) &&
    !completion.suites.some(
      (suite) =>
        suite.entryId === entryId &&
        (suite.status === 'failed' || suite.status === 'cancelled')
    )
  )
}

export function hasOnlyBrowserCleanupRunFailures(
  completion: Parameters<typeof hasOnlyBrowserCleanupFailures>[1] & {
    status: 'passed' | 'failed' | 'cancelled'
    recordedReporterErrors?: readonly SerializedDiagnostic[]
    entries: readonly { entry: { id: string } }[]
  }
) {
  const errors = completion.events.filter(
    (event) =>
      event.type === 'diagnostic' && event.diagnostic.severity === 'error'
  )
  return (
    completion.status === 'failed' &&
    !completion.recordedReporterErrors?.length &&
    errors.length > 0 &&
    errors.every(
      (event) =>
        event.type === 'diagnostic' &&
        event.entryId !== undefined &&
        isBrowserCleanupRunError(event.diagnostic)
    ) &&
    completion.entries.length > 0 &&
    completion.files.length === completion.entries.length &&
    completion.entries.every(({ entry }) =>
      completion.files.some((file) => file.entryId === entry.id)
    ) &&
    completion.files.every(
      (file) =>
        file.status === 'passed' ||
        file.status === 'skipped' ||
        hasOnlyBrowserCleanupFailures(file.entryId, completion)
    ) &&
    completion.cases.every(
      (test) => test.status !== 'failed' && test.status !== 'cancelled'
    ) &&
    completion.suites.every(
      (suite) => suite.status !== 'failed' && suite.status !== 'cancelled'
    )
  )
}
