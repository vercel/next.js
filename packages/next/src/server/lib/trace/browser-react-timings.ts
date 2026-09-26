import { HMR_MESSAGE_SENT_TO_SERVER } from '../../dev/hot-reloader-types'
import type { BrowserReactTimingsMessage } from '../../dev/hot-reloader-types'
import type { ReactTimingRecord } from '../../../shared/lib/react-debug-timing'
import {
  copyBrowserReactTimingRecord,
  isBrowserReactTimingRecord,
  MAX_BROWSER_REACT_TIMING_BATCH,
  MAX_BROWSER_REACT_TIMING_MESSAGE_LENGTH,
} from '../../../shared/lib/react-debug-timing-transport'
import {
  getValidatedDevHtmlRequestId,
  getValidatedDevRequestId,
} from '../dev-request-id'
import {
  getRequestInsightForDebugRequest,
  isRequestInsightsEnabled,
} from './request-insights'
import { createReactTimingSpanRecords } from './react-render-timing'
import { createLocalSpanId } from './local-span-recorder'
import { recordSpans, type SpanStoreRecord } from './span-store'

const MAX_REQUEST_RECORDS = 8192
const MAX_REQUEST_BYTES = 8 * 1024 * 1024
const MAX_REQUEST_DECODERS = 128

type Decoder = {
  renderId: string
  highestRecordId: number
}

export type BrowserReactTimingState = {
  decoders: Map<string, Decoder>
  recordCount: number
  byteLength: number
  exhausted: boolean
  partialReported: boolean
}

export function createBrowserReactTimingReceiver(
  htmlRequestId: string | null,
  enabled: boolean
) {
  const documentId = getValidatedDevHtmlRequestId(htmlRequestId ?? undefined)
  let disposed = false

  return {
    receive(value: unknown, messageLength: number) {
      if (
        disposed ||
        !enabled ||
        !documentId ||
        !isRequestInsightsEnabled() ||
        !Number.isSafeInteger(messageLength) ||
        messageLength < 0 ||
        messageLength > MAX_BROWSER_REACT_TIMING_MESSAGE_LENGTH ||
        !value ||
        typeof value !== 'object'
      ) {
        return
      }
      const message = value as BrowserReactTimingsMessage
      if (
        message.event !== HMR_MESSAGE_SENT_TO_SERVER.REACT_DEBUG_TIMINGS ||
        (!getValidatedDevRequestId(message.requestId) &&
          message.requestId !== documentId) ||
        typeof message.decoderId !== 'string' ||
        !/^\d{1,16}$/.test(message.decoderId) ||
        !Array.isArray(message.records) ||
        (message.records.length === 0 && message.partial !== true) ||
        (message.partial !== undefined && message.partial !== true) ||
        message.records.length > MAX_BROWSER_REACT_TIMING_BATCH ||
        !message.records.every(isBrowserReactTimingRecord)
      ) {
        return
      }

      const target = getRequestInsightForDebugRequest(
        message.requestId,
        documentId
      )
      if (!target?.parent) return
      const { identity, insight, parent, browserTimings: state } = target
      if (state.exhausted) return
      let decoder = state.decoders.get(message.decoderId)
      if (!decoder) {
        if (state.decoders.size >= MAX_REQUEST_DECODERS) {
          state.exhausted = true
        } else {
          decoder = {
            renderId: createLocalSpanId(),
            highestRecordId: -1,
          }
          state.decoders.set(message.decoderId, decoder)
        }
      }
      const records: ReactTimingRecord[] = []
      if (decoder) {
        for (const record of message.records) {
          const id = Number(record.id.slice(8))
          if (id <= decoder.highestRecordId) continue
          if (state.recordCount + records.length >= MAX_REQUEST_RECORDS) {
            state.exhausted = true
            break
          }
          decoder.highestRecordId = id
          records.push(copyBrowserReactTimingRecord(record))
        }
      }
      const context = {
        requestId: identity.requestId,
        requestInsightKind: identity.kind,
        requestInsightSource: insight?.source ?? identity.source,
        requestInsightProxyStatus: insight?.proxyStatus ?? identity.proxyStatus,
        htmlRequestId: identity.htmlRequestId,
        route: insight?.route ?? identity.route,
        url: insight?.url ?? identity.url,
        traceId: parent.traceId,
        parentSpanId: parent.spanId,
      }
      const spans: SpanStoreRecord[] = []
      if (decoder) {
        for (const span of createReactTimingSpanRecords(
          records,
          context,
          decoder.renderId
        )) {
          const bytes = Buffer.byteLength(JSON.stringify(span), 'utf8')
          if (state.byteLength + bytes > MAX_REQUEST_BYTES) {
            state.exhausted = true
            break
          }
          state.byteLength += bytes
          state.recordCount++
          spans.push(span)
        }
      }
      if ((message.partial || state.exhausted) && !state.partialReported) {
        state.partialReported = true
        spans.push({
          ...context,
          name: 'ReactServerComponents.incomplete',
          spanId: createLocalSpanId(parent.spanId),
          timestamp: performance.timeOrigin + performance.now(),
          attributes: {
            'next.span_type': 'ReactServerComponents.incomplete',
            'next.span_name': 'Some decoded React observations were dropped',
            'next.span_category': 'application',
            'next.rsc.render_id': decoder?.renderId ?? createLocalSpanId(),
            'next.rsc.observation': 'decoded',
            'next.rsc.observation_partial': true,
            'next.rsc.incomplete_reason': state.exhausted
              ? 'budget'
              : 'transport',
          },
        })
      }
      if (spans.length > 0) recordSpans(spans)
    },
    dispose() {
      disposed = true
    },
  }
}
