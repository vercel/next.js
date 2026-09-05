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

export function postNextTelemetryPayload(
  payload: Payload,
  signal?: AbortSignal
) {
  const timeoutSignal = AbortSignal.timeout(5000)
  signal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

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
