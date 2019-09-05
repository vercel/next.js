import { record } from '../storage'

const EVENT_VERSION = 'NEXT_CLI_SESSION_STARTED'

type EventCliSessionStarted = {
  nextVersion: string
  nodeVersion: string
  cliCommand: string
}

export function recordVersion(
  event: Omit<EventCliSessionStarted, 'nextVersion' | 'nodeVersion'>
) {
  // This should be an invariant, if it fails our build tooling is broken.
  if (typeof process.env.__NEXT_VERSION !== 'string') {
    return Promise.resolve()
  }

  return record({
    eventName: EVENT_VERSION,
    payload: {
      nextVersion: process.env.__NEXT_VERSION,
      nodeVersion: process.version,
      cliCommand: event.cliCommand,
    } as EventCliSessionStarted,
  })
}
