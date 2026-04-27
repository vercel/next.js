const EVENT_UNKNOWN_CLI_FLAG = 'NEXT_CLI_UNKNOWN_FLAG'

type EventUnknownCliFlag = {
  cliCommand: string
  unknownFlag: string
}

export function eventUnknownCliFlag(event: EventUnknownCliFlag): {
  eventName: string
  payload: EventUnknownCliFlag
} {
  return {
    eventName: EVENT_UNKNOWN_CLI_FLAG,
    payload: event,
  }
}
