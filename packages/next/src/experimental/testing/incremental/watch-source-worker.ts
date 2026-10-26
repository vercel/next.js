import { Worker } from 'worker_threads'
import type {
  WatchSourceRequest,
  WatchSourceResponse,
} from './watch-source-protocol'
import { createWatchSourceErrorEncoder } from './watch-source-errors'

const encode = createWatchSourceErrorEncoder('transport')
let worker: Worker | undefined
let closing = false
let engineClosed = false
let engineExited = false
let engineErrored = false
let exitCode = 0
let disconnecting = false
let sending = false
const outgoing: WatchSourceResponse[] = []
function die() {
  process.kill(process.pid, 'SIGKILL')
}
function flush() {
  if (sending || !outgoing.length) return
  if (!process.connected) return die()
  sending = true
  process.send!(outgoing.shift()!, (error: Error | null) => {
    sending = false
    if (error) return die()
    flush()
    finish()
  })
}
function enqueue(value: WatchSourceResponse) {
  const previous = outgoing.at(-1)
  if (value.type === 'watch-source-change' && previous?.type === value.type) {
    previous.change = {
      changed: [
        ...new Set([...previous.change.changed, ...value.change.changed]),
      ],
      removed: [
        ...new Set([...previous.change.removed, ...value.change.removed]),
      ],
    }
  } else outgoing.push(value)
  flush()
}
function finish() {
  if (!engineExited || sending || outgoing.length) return
  disconnecting = true
  process.exitCode = exitCode
  if (process.connected) process.disconnect()
}
process.once('disconnect', () => {
  if (!disconnecting) die()
})
process.on(
  'message',
  (
    message: { type?: string; input?: WatchSourceRequest } | WatchSourceRequest
  ) => {
    if (message?.type === 'cancel') {
      closing = true
      if (worker) worker.postMessage({ type: 'cancel' })
      else {
        engineClosed = true
        finish()
      }
      return
    }
    const request =
      message?.type === 'run' ? message.input : (message as WatchSourceRequest)
    if (closing) return
    if (!worker) {
      if (request?.type !== 'watch-source-open')
        throw new Error('Input source did not open first.')
      worker = new Worker(require.resolve('./watch-source-engine'), {
        execArgv: [],
      })
      worker.on('message', (value: WatchSourceResponse) => {
        if (value?.type === 'watch-source-closed') engineClosed = true
        else enqueue(value)
      })
      worker.once('error', (error) => {
        engineErrored = true
        exitCode = 1
        enqueue({
          type: 'watch-source-error',
          failure: { occurrence: 0, error: encode(error) },
        })
        closing = true
      })
      worker.once('exit', (code) => {
        engineExited = true
        if (!engineClosed && !engineErrored) {
          enqueue({
            type: 'watch-source-error',
            failure: {
              occurrence: -1,
              error: encode(
                new Error(
                  `Input source engine exited before closure (${code}).`
                )
              ),
            },
          })
          engineClosed = true
          exitCode = 1
        }
        if (engineClosed) enqueue({ type: 'watch-source-closed' })
        finish()
      })
    }
    worker.postMessage(request)
  }
)
if (!process.connected) die()
