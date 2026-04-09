const EVENT_VERSION = 'NEXT_CLI_SESSION_STOPPED'

export type EventCliSessionStopped = {
  cliCommand: string
  nextVersion: string
  nodeVersion: string
  turboFlag?: boolean | null
  durationMilliseconds?: number | null
  pagesDir?: boolean
  appDir?: boolean
  isRspack: boolean
}

export function eventCliSessionStopped(
  event: Omit<
    EventCliSessionStopped,
    'nextVersion' | 'nodeVersion' | 'isRspack'
  >
): { eventName: string; payload: EventCliSessionStopped }[] {
  // This should be an invariant, if it fails our build tooling is broken.
  if (typeof process.env.__NEXT_VERSION !== 'string') {
    return []
  }

  const payload: EventCliSessionStopped = {
    nextVersion: process.env.__NEXT_VERSION,
    nodeVersion: process.version,
    cliCommand: event.cliCommand,
    durationMilliseconds: event.durationMilliseconds,
    ...(typeof event.turboFlag !== 'undefined'
      ? {
          turboFlag: !!event.turboFlag,
        }
      : {}),
    pagesDir: event.pagesDir,
    appDir: event.appDir,
    isRspack: process.env.NEXT_RSPACK !== undefined,
  }
  return [{ eventName: EVENT_VERSION, payload }]
}
