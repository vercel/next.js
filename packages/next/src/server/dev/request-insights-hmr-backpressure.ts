import { REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES } from '../../next-devtools/shared/request-insights'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
  type RequestInsightsSnapshotMessage,
  type RequestInsightsUpdateMessage,
} from './hot-reloader-types'

type RequestInsightsHmrMessage =
  | RequestInsightsUpdateMessage
  | RequestInsightsSnapshotMessage

type RequestInsightsHmrSocket = {
  readonly bufferedAmount: number
  readonly readyState: number
  send(data: string): void
}

type SerializedRequestInsightsHmrMessage = {
  payload: string
  byteLength: number
}

const WEBSOCKET_CONNECTING = 0
const WEBSOCKET_OPEN = 1
const REQUEST_INSIGHTS_HMR_RETRY_MS = 50
const REQUEST_INSIGHTS_HMR_SNAPSHOT_ENVELOPE_BYTES = 64 * 1024

export const REQUEST_INSIGHTS_HMR_MAX_BUFFERED_BYTES =
  2 *
  (REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES +
    REQUEST_INSIGHTS_HMR_SNAPSHOT_ENVELOPE_BYTES)

const REQUEST_INSIGHTS_HMR_SNAPSHOT_RESERVE_BYTES =
  REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES +
  REQUEST_INSIGHTS_HMR_SNAPSHOT_ENVELOPE_BYTES

const serializedSnapshotMessages = new WeakMap<
  RequestInsightsSnapshotMessage['snapshot'],
  {
    authoritative?: SerializedRequestInsightsHmrMessage
    ordinary?: SerializedRequestInsightsHmrMessage
  }
>()

export function isRequestInsightsHmrMessage(
  message: HmrMessageSentToBrowser
): message is RequestInsightsHmrMessage {
  return (
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_UPDATE ||
    message.type === HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT
  )
}

export function isRequestInsightsHmrSocketActive(client: {
  readonly readyState: number
}): boolean {
  return (
    client.readyState === WEBSOCKET_CONNECTING ||
    client.readyState === WEBSOCKET_OPEN
  )
}

/**
 * Bounds Request Insights delivery for one socket. On pressure, all skipped
 * mutations collapse into the latest full snapshot and one retry timer.
 */
export class RequestInsightsHmrClientBuffer {
  private resyncRequired = false
  private authoritativeResyncRequired = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(
    private readonly client: RequestInsightsHmrSocket,
    private readonly getSnapshot: () =>
      | RequestInsightsSnapshotMessage['snapshot']
      | undefined,
    private readonly onClose: () => void = () => {}
  ) {}

  send(message: RequestInsightsHmrMessage): void {
    if (this.closed) return
    if (this.resyncRequired) {
      this.authoritativeResyncRequired ||=
        message.type ===
          HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT &&
        message.authoritative === true
      this.scheduleRetry()
      return
    }

    if (this.client.readyState !== WEBSOCKET_OPEN) {
      if (this.client.readyState === WEBSOCKET_CONNECTING) {
        this.requireResync(
          message.type ===
            HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT &&
            message.authoritative === true
        )
      } else {
        this.close()
      }
      return
    }

    const serialized = serializeRequestInsightsHmrMessage(message)
    if (
      this.client.bufferedAmount + serialized.byteLength >
      REQUEST_INSIGHTS_HMR_MAX_BUFFERED_BYTES
    ) {
      this.requireResync(
        message.type ===
          HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT &&
          message.authoritative === true
      )
      return
    }
    this.client.send(serialized.payload)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.resyncRequired = false
    this.authoritativeResyncRequired = false
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    this.onClose()
  }

  private requireResync(authoritative = false): void {
    this.resyncRequired = true
    this.authoritativeResyncRequired ||= authoritative
    this.scheduleRetry()
  }

  private scheduleRetry(): void {
    if (this.closed || this.retryTimer) return
    this.retryTimer = setTimeout(
      () => this.flushResync(),
      REQUEST_INSIGHTS_HMR_RETRY_MS
    )
    this.retryTimer.unref?.()
  }

  private flushResync(): void {
    this.retryTimer = undefined
    if (this.closed || !this.resyncRequired) return
    if (this.client.readyState !== WEBSOCKET_OPEN) {
      if (this.client.readyState === WEBSOCKET_CONNECTING) {
        this.scheduleRetry()
      } else {
        this.close()
      }
      return
    }
    if (
      this.client.bufferedAmount >
      REQUEST_INSIGHTS_HMR_MAX_BUFFERED_BYTES -
        REQUEST_INSIGHTS_HMR_SNAPSHOT_RESERVE_BYTES
    ) {
      this.scheduleRetry()
      return
    }

    const snapshot = this.getSnapshot()
    if (!snapshot) {
      this.resyncRequired = false
      this.authoritativeResyncRequired = false
      return
    }
    const serialized = serializeRequestInsightsHmrMessage({
      type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT,
      snapshot,
      authoritative: this.authoritativeResyncRequired || undefined,
    })
    if (
      this.client.bufferedAmount + serialized.byteLength >
      REQUEST_INSIGHTS_HMR_MAX_BUFFERED_BYTES
    ) {
      this.scheduleRetry()
      return
    }

    this.client.send(serialized.payload)
    this.resyncRequired = false
    this.authoritativeResyncRequired = false
  }
}

function serializeRequestInsightsHmrMessage(
  message: RequestInsightsHmrMessage
): SerializedRequestInsightsHmrMessage {
  if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT) {
    const cacheKey =
      message.authoritative === true ? 'authoritative' : 'ordinary'
    const cached = serializedSnapshotMessages.get(message.snapshot)?.[cacheKey]
    if (cached) return cached

    const payload = JSON.stringify(message)
    const serialized = {
      payload,
      byteLength: Buffer.byteLength(payload, 'utf8'),
    }
    const cache = serializedSnapshotMessages.get(message.snapshot) ?? {}
    cache[cacheKey] = serialized
    serializedSnapshotMessages.set(message.snapshot, cache)
    return serialized
  }

  const payload = JSON.stringify(message)
  return { payload, byteLength: Buffer.byteLength(payload, 'utf8') }
}
