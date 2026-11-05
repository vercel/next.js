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
import { recordSpans } from './span-store'

type Decoder = {
  renderId: string
  highestRecordId: number
  partialReported: boolean
}

export function createBrowserReactTimingReceiver(
  htmlRequestId: string | null,
  enabled: boolean
) {
  const documentId = getValidatedDevHtmlRequestId(htmlRequestId ?? undefined)
  const decoders = new Map<string, Decoder>()
  let received = 0
  let windowStart = Date.now()

  return {
    receive(value: unknown, messageLength: number) {
      if (
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
      const { identity, insight, parent } = target

      const now = Date.now()
      if (now - windowStart >= 60_000) {
        windowStart = now
        received = 0
      }
      received += Math.max(1, message.records.length)

      const key = `${identity.requestId}:${message.decoderId}`
      let decoder = decoders.get(key)
      const rateLimited = received > 8192
      if (rateLimited && !decoder) return
      if (!decoder) {
        if (decoders.size >= 128) {
          decoders.delete(decoders.keys().next().value!)
        }
        decoder = {
          renderId: createLocalSpanId(),
          highestRecordId: -1,
          partialReported: false,
        }
      } else {
        decoders.delete(key)
      }
      decoders.set(key, decoder)
      const records: ReactTimingRecord[] = []
      if (!rateLimited) {
        for (const record of message.records) {
          const id = Number(record.id.slice(8))
          if (id <= decoder.highestRecordId) continue
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
      const spans = createReactTimingSpanRecords(
        records,
        context,
        decoder.renderId
      )
      if ((message.partial || rateLimited) && !decoder.partialReported) {
        decoder.partialReported = true
        spans.push({
          ...context,
          name: 'ReactServerComponents.incomplete',
          spanId: createLocalSpanId(parent.spanId),
          timestamp: performance.timeOrigin + performance.now(),
          attributes: {
            'next.span_type': 'ReactServerComponents.incomplete',
            'next.span_name': 'Some decoded React observations were dropped',
            'next.span_category': 'application',
            'next.rsc.render_id': decoder.renderId,
            'next.rsc.observation': 'decoded',
            'next.rsc.observation_partial': true,
          },
        })
      }
      if (spans.length > 0) recordSpans(spans)
    },
    dispose() {
      decoders.clear()
    },
  }
}
