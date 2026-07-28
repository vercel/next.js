import retry from 'next/dist/compiled/async-retry'

interface Payload {
  meta: { [key: string]: unknown }

  context: {
    anonymousId: string
    projectId: string
    sessionId: string
  }

  events: Array<{
    eventName: string
    fields: object
  }>
}

export function postNextTelemetryPayload(payload: Payload, signal?: any) {
  // The built-in timeout must always bound the wait, even when the caller
  // provides its own cancellation signal (e.g. `next build`). Otherwise a
  // stalled telemetry endpoint can delay the process far beyond the timeout.
  if ('timeout' in AbortSignal) {
    const timeoutSignal = AbortSignal.timeout(5000)
    if (signal && 'any' in AbortSignal) {
      signal = AbortSignal.any([signal, timeoutSignal])
    } else if (!signal) {
      signal = timeoutSignal
    }
  }
  return (
    retry(
      () =>
        fetch('https://telemetry.nextjs.org/api/v1/record', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'content-type': 'application/json' },
          signal,
        }).then((res) => {
          if (!res.ok) {
            const err = new Error(res.statusText)
            ;(err as any).response = res
            throw err
          }
        }),
      { minTimeout: 500, retries: 1, factor: 1 }
    )
      .catch(() => {
        // We swallow errors when telemetry cannot be sent
      })
      // Ensure promise is voided
      .then(
        () => {},
        () => {}
      )
  )
}
