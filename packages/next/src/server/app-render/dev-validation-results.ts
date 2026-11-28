/**
 * Publishes the outcome of each development Cache Components validation so the
 * dev server can answer "did this route validate?" without a browser.
 *
 * Validation normally reports through the terminal and the dev overlay. The
 * MCP `check_route` tool needs the same outcome as data. The state lives on
 * `globalThis` because the app-page runtime bundle and the dev server load
 * this module separately.
 */

export type DevValidationStatus =
  /** Validation ran to completion. `errors` holds what it found. */
  | 'validated'
  /** Server caches were bypassed for the request, so validation did not run. */
  | 'skipped'
  /** A newer render superseded the validation before it finished. */
  | 'aborted'
  /** The validator failed before producing a result. */
  | 'failed'

export type DevValidationError = {
  message: string
  /**
   * Where the error points in the app's source, as `file:line:column`, or null
   * when no frame could be mapped back to a source file.
   */
  location: string | null
  /**
   * The source-mapped stack and code frame, as `next dev` prints them to the
   * terminal. Null for a non-Error message.
   */
  stack: string | null
}

export type DevValidationResult = {
  status: DevValidationStatus
  errors: DevValidationError[]
}

type Listener = (result: DevValidationResult) => void

const LISTENERS = Symbol.for('next.dev.validationResultListeners')

const holder = globalThis as { [LISTENERS]?: Map<string, Listener> }

export function isAwaitingDevValidation(htmlRequestId: string): boolean {
  return holder[LISTENERS]?.has(htmlRequestId) ?? false
}

export function reportDevValidationResult(
  htmlRequestId: string,
  status: DevValidationStatus,
  errors?: () => DevValidationError[]
): void {
  // Formatting a source-mapped stack is only necessary for an active check.
  holder[LISTENERS]?.get(htmlRequestId)?.({ status, errors: errors?.() ?? [] })
}

/**
 * Turns a validation error into data. Must run where the error was created:
 * the source-mapped stack comes from the `inspect` hook that `next dev`
 * installs on `Error`, which is also what renders it in the terminal.
 */
export function describeValidationError(error: unknown): DevValidationError {
  if (!(error instanceof Error)) {
    return { message: String(error), location: null, stack: null }
  }

  const { inspect, stripVTControlCharacters } =
    require('node:util') as typeof import('node:util')
  const rendered = stripVTControlCharacters(inspect(error, { colors: false }))

  // The rendering is `<name>: <message>` followed by the frames and the code
  // frame. Keep only what follows the message.
  const messageEnd = rendered.indexOf(error.message)
  const stack = (
    messageEnd === -1
      ? rendered
      : rendered.slice(messageEnd + error.message.length)
  ).trim()

  // The first frame that names a file with a line and column, with or without
  // a function name in front of it.
  const frame = /^\s*at (?:.*? \()?([^()\s]+:\d+:\d+)\)?$/m.exec(stack)

  return {
    message: error.message,
    location: frame ? frame[1] : null,
    stack: stack === '' ? null : stack,
  }
}

export function onDevValidationResult(
  htmlRequestId: string,
  listener: Listener
): () => void {
  const listeners = (holder[LISTENERS] ??= new Map())
  listeners.set(htmlRequestId, listener)
  return () => {
    listeners.delete(htmlRequestId)
  }
}
