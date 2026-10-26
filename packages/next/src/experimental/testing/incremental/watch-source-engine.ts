import { parentPort } from 'worker_threads'
import { watchTestFiles, type TestWatchSource } from './watch-files'
import { createWatchSourceErrorEncoder } from './watch-source-errors'
import type {
  WatchSourceRequest,
  WatchSourceResponse,
} from './watch-source-protocol'

if (!parentPort)
  throw new Error('Input source engine requires its transport owner.')
const port = parentPort
const encode = createWatchSourceErrorEncoder()
const observations = new WeakMap<object, number>()
let nextOccurrence = 0
let source: TestWatchSource | undefined
let opening = false
let closing = false
let operations = Promise.resolve()
let closeWork: Promise<void> | undefined
const closeFailureObservation = {}
let activeFailureObserved = false
function post(message: WatchSourceResponse) {
  port.postMessage(message)
}
function publishFailure(error: unknown, observation = {}) {
  if (observations.has(observation)) return
  const occurrence = ++nextOccurrence
  observations.set(observation, occurrence)
  activeFailureObserved = true
  try {
    post({
      type: 'watch-source-error',
      failure: { occurrence, error: encode(error) },
    })
  } catch (observerError) {
    // Notify the responsive owner even if the original error cannot be cloned.
    // The local engine still owns its normal close path after this observer throws.
    try {
      post({
        type: 'watch-source-error',
        failure: {
          occurrence: ++nextOccurrence,
          error: encode(
            new Error('Input source failure delivery failed.', {
              cause: observerError,
            })
          ),
        },
      })
    } catch {
      process.kill(process.pid, 'SIGKILL')
    }
    throw observerError
  }
}
function close(): Promise<void> {
  if (closeWork) return closeWork
  closing = true
  closeWork = (async () => {
    // The operation failure handler publishes that occurrence. Its rejection
    // cannot skip the independent source cleanup or become a second occurrence.
    await operations.catch(() => {})
    await source?.close()
    post({ type: 'watch-source-closed' })
    port.close()
  })()
  return closeWork
}
port.on('message', (value: WatchSourceRequest) => {
  if (value?.type === 'cancel') {
    void close().catch((error) => {
      publishFailure(error, closeFailureObservation)
      port.close()
    })
    return
  }
  if (closing) return
  operations = operations.then(async () => {
    activeFailureObserved = false
    try {
      if (value?.type === 'watch-source-open' && !opening) {
        opening = true
        source = await watchTestFiles({
          ...value.directories,
          onChange: (change) => post({ type: 'watch-source-change', change }),
          onError: publishFailure,
          observeFailureBeforeClose: publishFailure,
        })
        post({ type: 'watch-source-ready', id: value.id })
      } else if (value?.type === 'watch-source-update' && source) {
        await source.update(value.directories)
        post({ type: 'watch-source-updated', id: value.id })
      } else throw new Error('Invalid input source operation.')
    } catch (error) {
      post({
        type: 'watch-source-operation-failed',
        id: value.id,
        error: encode(error),
      })
      if (!activeFailureObserved) publishFailure(error)
      queueMicrotask(
        () =>
          void close().catch((cleanupError) => {
            publishFailure(cleanupError, closeFailureObservation)
            port.close()
          })
      )
    }
  })
  void operations.catch((error) => {
    publishFailure(error)
    void close().catch((cleanupError) => {
      publishFailure(cleanupError, closeFailureObservation)
      port.close()
    })
  })
})
