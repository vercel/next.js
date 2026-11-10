/**
 * The lifecycle events Cache Components validation emits so E2E tests can
 * locate the validation window in the CLI output. Each is serialized between
 * `<VALIDATION_MESSAGE>` delimiters (see `formatValidationEvent`) and parsed
 * back by the test harness. Produced by the in-process validation in
 * `app-render.tsx` (both dev and build) and by the validation worker, which is
 * why the shape lives here rather than in a single producer.
 *
 * `requestId` correlates a start with its matching end/aborted. Dev and worker
 * validation use the render's request id; build validation, which has no such
 * id, uses a stringified timestamp instead.
 */
export type ValidationEvent =
  | ValidationStartEvent
  | ValidationEndEvent
  | ValidationAbortedEvent

export type ValidationStartEvent = {
  type: 'validation_start'
  requestId: string
  url: string
  /**
   * Only reported for development validation.
   */
  responseFinished?: boolean
}

export type ValidationEndEvent = {
  type: 'validation_end'
  requestId: string
  url: string
}

/**
 * Emitted when detached validation is aborted. It can appear without a start
 * when cancellation happens before validation runs, or after a start instead of
 * an end when in-flight validation is cancelled.
 */
export type ValidationAbortedEvent = {
  type: 'validation_aborted'
  requestId: string
  url: string
}

/**
 * Wraps a validation event in the `<VALIDATION_MESSAGE>` delimiters the test
 * harness scans for. The caller chooses the output stream (dev validation logs
 * to stdout; build validation uses stderr for deterministic ordering).
 */
export function formatValidationEvent(event: ValidationEvent): string {
  return (
    '<VALIDATION_MESSAGE>' + JSON.stringify(event) + '</VALIDATION_MESSAGE>'
  )
}
