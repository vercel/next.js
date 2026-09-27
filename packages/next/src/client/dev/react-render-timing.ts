import { NEXT_REQUEST_ID_HEADER } from '../components/app-router-headers'
import { HMR_MESSAGE_SENT_TO_SERVER } from '../../server/dev/hot-reloader-types'
import type { ReactTimingRecord } from '../../shared/lib/react-debug-timing'
import {
  copyBrowserReactTimingRecord,
  isBrowserReactTimingRecord,
  MAX_BROWSER_REACT_TIMING_BATCH,
  MAX_BROWSER_REACT_TIMING_MESSAGE_LENGTH,
  MAX_BROWSER_REACT_TIMING_QUEUE,
} from '../../shared/lib/react-debug-timing-transport'
import {
  bindReactDecoderPromise,
  bindReactDecoderStream,
  runWithReactDecoderScope,
  type ReactDecoderScope,
} from './react-decoder-host'

let sendMessage: ((message: string) => boolean | void) | undefined
let nextDecoderId = 0
// Only primitive records waiting for the initial HMR connection, never decoded
// roots or responses. Bound the number of pending decoders as well as records.
const pending = new Set<() => void>()
let pendingOverflow = false

export function setReactTimingSender(
  sender: ((message: string) => boolean | void) | undefined
): void {
  sendMessage = sender
  if (sender) {
    if (pendingOverflow) {
      pendingOverflow = false
      console.warn(
        '[Request Insights] Some React timings were dropped while the development connection was unavailable.'
      )
    }
    for (const flush of [...pending]) flush()
  }
}

export function createBrowserReactTiming(
  requestHeaders: Record<string, string>
) {
  const requestId = requestHeaders[NEXT_REQUEST_ID_HEADER]
  const decoderId = String(nextDecoderId++)
  let nextRecordId = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let partial = false
  let partialReported = false
  const records: ReactTimingRecord[] = []

  function flush() {
    if (!sendMessage) {
      if (
        pending.size >= MAX_BROWSER_REACT_TIMING_BATCH &&
        !pending.has(flush)
      ) {
        records.length = 0
        partial = true
        pendingOverflow = true
      } else {
        pending.add(flush)
      }
      return
    }
    pending.delete(flush)
    while (records.length > 0 || (partial && !partialReported)) {
      const batch = records.slice(0, MAX_BROWSER_REACT_TIMING_BATCH)
      const payload = {
        event: HMR_MESSAGE_SENT_TO_SERVER.REACT_DEBUG_TIMINGS,
        requestId,
        decoderId,
        partial: partial || undefined,
        records: batch,
      }
      let message = JSON.stringify(payload)
      while (
        message.length > MAX_BROWSER_REACT_TIMING_MESSAGE_LENGTH &&
        batch.length > 1
      ) {
        batch.pop()
        message = JSON.stringify(payload)
      }
      let sent = false
      try {
        sent = sendMessage(message) !== false
      } catch {
        // A socket can close between readiness checking and send(). Keep this
        // bounded batch for the next connection, without a polling timer.
      }
      if (!sent) {
        sendMessage = undefined
        pending.add(flush)
        return
      }
      records.splice(0, batch.length)
      partialReported ||= partial
    }
  }

  const scope: ReactDecoderScope = {
    record(timing) {
      const record = { ...timing, id: `decoded:${nextRecordId++}` }
      if (
        records.length < MAX_BROWSER_REACT_TIMING_QUEUE &&
        isBrowserReactTimingRecord(record)
      ) {
        records.push(copyBrowserReactTimingRecord(record))
      } else {
        partial = true
      }
      if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined
          flush()
        }, 0)
      }
    },
  }

  return {
    run<T>(callback: () => T): T {
      return runWithReactDecoderScope(scope, callback)
    },
    wrapStream<T>(stream: ReadableStream<T>): ReadableStream<T> {
      return bindReactDecoderStream(stream, scope)
    },
    wrapResponse(promise: Promise<Response>): Promise<Response> {
      return bindReactDecoderPromise(
        promise.then((response) => {
          if (!response.body) return response
          const body = bindReactDecoderStream(response.body, scope)
          return new Proxy(response, {
            get(target, key) {
              if (key === 'body') return body
              const value = Reflect.get(target, key, target)
              return typeof value === 'function' ? value.bind(target) : value
            },
          })
        }),
        scope
      )
    },
  }
}
