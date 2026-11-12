# Testing a streamed route response

Use `rsc.renderRouteStream` to inspect a route's headers and consume its HTML or
Flight body as it arrives. The test must use an explicit existing force-dynamic
RSC route, the Node.js runtime and Turbopack. Development and production profiles
support this API.

## Example

The examples assume the selected route serves `/acme/example`. They read the
response, then show how to stop consuming an unfinished response. The public
[RSC declarations](./rsc.d.ts) describe the options and result types.

### Step 1: Read the headers and body

```ts
import { expect, test } from 'vitest'
import { rsc } from 'next/experimental/testing/rsc'

test('reads a route response', async () => {
  const result = await rsc.renderRouteStream({
    cacheScope: 'file',
    format: 'html',
    url: 'http://localhost/acme/example',
  })
  try {
    const response = await result.response
    expect(response.status).toBe(200)

    const reader = result.stream.getReader()
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        expect(ArrayBuffer.isView(chunk.value)).toBe(true)
      }
    } finally {
      reader.releaseLock()
    }

    expect(await result.completed).toEqual({ status: 'completed' })
  } finally {
    await result.dispose()
  }
})
```

`response` resolves when headers commit. The status, header dictionary and
detached header arrays are readonly snapshots. A late redirect can subsequently
appear in the body as HTML refresh metadata or a Flight redirect digest.
Use `format: 'flight'` to consume the Flight response.

Consume or cancel the body before awaiting `completed`. Awaiting completion
without reading the body can leave the response waiting for its consumer.
Completion also waits for request cleanup and `after()` work.

### Step 2: Stop reading an unfinished response

When a test only needs the beginning of a response, replace the first example's
reader block and completion assertion with the following:

```ts
const reader = result.stream.getReader()
try {
  await reader.read()
  const reason = { stoppedAfterFirstChunk: true }
  await reader.cancel(reason)
  expect(await result.completed).toEqual({ status: 'aborted', reason })
} finally {
  reader.releaseLock()
}
```

Keep the outer `finally` from the first example. `result.dispose(reason)` can
also stop consumption; it errors pending public reads with the supplied reason.
Cancelling a native reader closes its pending reads. Both paths join the
request's owned work. Stream-delivery and request-cleanup failures reject
`completed` and remain test-cleanup failures even when a test asserts that
rejection.

## Rendering errors

A component error can be encoded in a completed response. Assert the status and
HTML or Flight error data using the same expectations as the selected application
route. For the supported force-dynamic Node routes, a server rendering error
produces an HTML error response with status 500. The equivalent Flight response
has status 200 and carries the serialized error and its digest. Development and
production preserve the application's respective error serialization and boundary
metadata. A following request still receives its own route and request context.

An encoded rendering error does not by itself reject `completed`. Stream-delivery
or cleanup failures still reject it as described above. Request cleanup also
waits for React's associated development debug stream to finish, including when
the main response is cancelled. Keep the outer `finally` and await `dispose()`
for successful, failed and aborted responses.

## Next steps

Use `rsc.renderRoute` when a test needs a complete buffered body, status and
headers after cleanup. Static/prerender routes, Cache Components/PPR, Server
Action transport and client hydration require separate support.

For strict Node16 ESM TypeScript resolution, use the explicit
`next/experimental/testing/rsc.js` import. See the [test TypeScript opt-ins](./README.md)
for the separate test project's declarations.
