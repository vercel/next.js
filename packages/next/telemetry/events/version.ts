const EVENT_VERSION = 'NEXT_CLI_SESSION_STARTED'

type EventCliSessionStarted = {
  nextVersion: string
  nodeVersion: string
  cliCommand: string
  isSrcDir: boolean | null
  hasNowJson: boolean
  isCustomServer: boolean | null
}

export function eventVersion(
  event: Omit<EventCliSessionStarted, 'nextVersion' | 'nodeVersion'>
): { eventName: string; payload: EventCliSessionStarted }[] {
  // This should be an invariant, if it fails our build tooling is broken.
  if (typeof process.env.__NEXT_VERSION !== 'string') {
    return []
  }

  return [
    {
      eventName: EVENT_VERSION,
      payload: {
        nextVersion: process.env.__NEXT_VERSION,
        nodeVersion: process.version,
        cliCommand: event.cliCommand,
        isSrcDir: event.isSrcDir,
        hasNowJson: event.hasNowJson,
        isCustomServer: event.isCustomServer,
      } as EventCliSessionStarted,
    },
  ]
}
