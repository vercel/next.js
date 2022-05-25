const EVENT_NEXT_FATAL_ERROR = 'NEXT_FATAL_ERROR'
type NextFatalErrorEvent = {
  eventName: string
  payload: {
    error: string
  }
}

export function eventFatalError(error: string): NextFatalErrorEvent {
  return {
    eventName: EVENT_NEXT_FATAL_ERROR,
    payload: {
      error,
    },
  }
}
