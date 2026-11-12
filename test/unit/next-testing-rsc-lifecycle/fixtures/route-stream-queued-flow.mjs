import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createRouteStreamResponse } = require(process.argv[2])
const RenderResult = require(process.argv[3]).default
let cancels = 0
let closes = 0
const owned = createRouteStreamResponse({ url: '/' }, async () => {
  closes++
})
// Actual MockedResponse writes are buffered before the native toWeb pull
// schedules its resume. Cancellation must retire that pending flow too.
owned.res.flushHeaders()
owned.res.write(new TextEncoder().encode('queued response bytes'))
const { result } = owned.start(
  new RenderResult(
    new ReadableStream({
      cancel() {
        cancels++
      },
    }),
    { metadata: {}, contentType: 'text/html' }
  )
)
const reader = result.stream.getReader()
await Promise.resolve()
const reason = new Error('cancel actual pending native resume')
await reader.cancel(reason)
assert.deepEqual(await result.completed, { status: 'aborted', reason })
await result.dispose()
reader.releaseLock()
assert.equal(cancels, 1)
assert.equal(closes, 1)
assert.equal(owned.res.closed, true)
// A queued native resume must not deliver into an already closed controller.
await new Promise((resolve) => setImmediate(resolve))
console.log(
  JSON.stringify({
    queuedByteCancellation: true,
    sourceCancelCount: cancels,
    requestCloseCount: closes,
    ownedResponseClosed: true,
  })
)
