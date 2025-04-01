export const eventNameErrorFeedback = 'NEXT_ERROR_FEEDBACK'

export type EventErrorFeedback = {
  errorCode: string
  wasHelpful: boolean
}

/**
 * Records telemetry for error feedback.
 *
 * @example
 * ```ts
 * telemetry.record(eventErrorFeedback({
 *   errorCode: 'E1',
 *   wasHelpful: true
 * }))
 * ```
 */
export function eventErrorFeedback(event: EventErrorFeedback): {
  eventName: string
  payload: EventErrorFeedback
} {
  return {
    eventName: eventNameErrorFeedback,
    payload: event,
  }
}
