import retry from 'next/dist/compiled/async-retry'
const { fetch } = require('next/dist/compiled/undici') as {
  fetch: typeof global.fetch
}

export function _postPayload(endpoint: string, body: object, signal?: any) {
  if (!signal) {
    // @ts-expect-error Needs @types/node@16.14.0 or newer
    signal = AbortSignal.timeout(5000)
  }
  return (
    retry(
      () =>
        fetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(body),
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
