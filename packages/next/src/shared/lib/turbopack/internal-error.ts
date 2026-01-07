import type { TurbopackInternalErrorOpts } from '../../../build/swc/generated-native'
import { eventErrorThrown } from '../../../telemetry/events'
import { traceGlobals } from '../../../trace/shared'

/**
 * An error caused by a bug in Turbopack, and not the user's code (e.g. a Rust panic). These should
 * be written to a log file and details should not be shown to the user.
 *
 * These are constructed in Turbopack by calling `throwTurbopackInternalError`.
 */
export class TurbopackInternalError extends Error {
  name = 'TurbopackInternalError'
  location: string | undefined

  // Manually set this as this isn't statically determinable
  __NEXT_ERROR_CODE = 'TurbopackInternalError'

  constructor({ message, anonymizedLocation }: TurbopackInternalErrorOpts) {
    super(message)
    this.location = anonymizedLocation
  }
}

/**
 * A helper used by the napi Rust entrypoints to construct and throw a `TurbopackInternalError`.
 *
 * When called, this will emit a telemetry event.
 */
export function throwTurbopackInternalError(
  conversionError: Error | null,
  opts: TurbopackInternalErrorOpts
): never {
  if (conversionError != null) {
    // Somehow napi failed to convert `opts` to a JS object??? Just give up and throw that instead.
    throw new Error(
      'NAPI type conversion error in throwTurbopackInternalError',
      {
        cause: conversionError,
      }
    )
  }
  const err = new TurbopackInternalError(opts)
  const telemetry = traceGlobals.get('telemetry')
  if (telemetry) {
    telemetry.record(eventErrorThrown(err, opts.anonymizedLocation))
  } else {
    console.error('Expected `telemetry` to be set in globals')
  }
  throw err
}
