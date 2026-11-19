import {
  getRequestInsightKey,
  getRequestInsightKind,
  type RequestInsightKind,
  type RequestInsightProxyStatus,
  type RequestInsightSource,
} from '../../../shared/lib/request-insights'
import type { LocalSpanParent } from './span-store'
import type { BrowserReactTimingState } from './browser-react-timings'

export type DebugRequestIdentity = RequestInsightIdentity & {
  debugRequestId?: string
}

export type RequestInsightDebugContext = {
  identity: DebugRequestIdentity & { requestId: string }
  parent: LocalSpanParent | undefined
  browserTimings: BrowserReactTimingState
  // Live requests, queued writes, and journal entries each hold a reference.
  retain(): void
  release(): void
}

export type RequestInsightIdentity = Readonly<{
  requestId?: string
  kind?: RequestInsightKind
  source?: RequestInsightSource
  proxyStatus?: RequestInsightProxyStatus
  htmlRequestId?: string
  route?: string
  url?: string
}>

export class RequestInsightCorrelations {
  private readonly requests = new Map<
    string,
    { contexts: Map<string, RequestInsightDebugContext>; ambiguous: boolean }
  >()

  register(identity: DebugRequestIdentity & { requestId: string }) {
    const debugRequestId =
      identity.debugRequestId ??
      (identity.requestId === identity.htmlRequestId
        ? identity.requestId
        : undefined)
    if (
      !debugRequestId ||
      !identity.htmlRequestId ||
      getRequestInsightKind(identity) !== 'request'
    )
      return undefined

    const debugKey = `${identity.htmlRequestId}:${debugRequestId}`
    const insightKey = getRequestInsightKey(identity)
    let entry = this.requests.get(debugKey)
    if (!entry) {
      entry = { contexts: new Map(), ambiguous: false }
      this.requests.set(debugKey, entry)
    }
    let context = entry.contexts.get(insightKey)
    if (!context) {
      if (entry.contexts.size > 0) entry.ambiguous = true
      let references = 0
      const contexts = entry.contexts
      context = {
        identity,
        parent: undefined,
        browserTimings: {
          decoders: new Map(),
          recordCount: 0,
          byteLength: 0,
          exhausted: false,
          partialReported: false,
        },
        retain() {
          references++
        },
        release: () => {
          if (--references === 0) {
            contexts.delete(insightKey)
            if (contexts.size === 0) this.requests.delete(debugKey)
          }
        },
      }
      contexts.set(insightKey, context)
    }
    context.identity = identity
    context.retain()
    return context
  }

  get(debugRequestId: string, htmlRequestId: string) {
    const entry = this.requests.get(`${htmlRequestId}:${debugRequestId}`)
    if (!entry || entry.ambiguous) return undefined
    return entry.contexts.values().next().value
  }
}
