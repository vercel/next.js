import type { TestRecordEvent } from '../contracts'
import type { TestArtifact } from '../runner/tasks'

export type ReporterTestRecordOutcome =
  | { kind: 'return'; value: TestArtifact | undefined }
  | { kind: 'throw'; error: unknown }

export interface TestRecordReporter {
  onTestCaseAnnotate?: unknown
  onTestCaseArtifactRecord?: unknown
}

const applyCallback = Reflect.apply

/** Actual record RPCs preserve the pinned direct-map invocation boundary. */
export async function invokeTestRecordReporters(
  reporters: readonly TestRecordReporter[],
  test: unknown,
  event: TestRecordEvent
): Promise<ReporterTestRecordOutcome> {
  const name =
    event.type === 'test-annotation'
      ? 'onTestCaseAnnotate'
      : 'onTestCaseArtifactRecord'
  const payload =
    event.type === 'test-annotation' ? event.annotation : event.artifact
  const value: TestArtifact =
    event.type === 'test-annotation'
      ? {
          type: 'internal:annotation',
          location: event.annotation.location,
          annotation: event.annotation,
        }
      : event.artifact
  try {
    // Keep this map synchronous: a getter or synchronous callback throw stops
    // later reporters; a returned rejected promise still allows their calls.
    await Promise.all(
      reporters.map((reporter) => {
        const callback = reporter[name]
        if (callback !== undefined && callback !== null)
          return applyCallback(callback as Function, reporter, [test, payload])
        return undefined
      })
    )
    return { kind: 'return', value }
  } catch (error) {
    // The pinned RPC's falsy rejection resolves to undefined. The authored
    // annotation bridge, rather than this dispatcher, owns its later unwrap.
    return error
      ? { kind: 'throw', error }
      : { kind: 'return', value: undefined }
  }
}
