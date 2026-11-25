import {
  recordSpans,
  type LocalSpanBatch,
  type LocalSpanParent,
} from './span-store'
import type { RequestInsightsIdentity } from './request-insights-identity'
import { reparentLocalSpans } from './local-span-recorder'
import { shouldRecordRequestInsightSpan } from './request-insights'

// This lives outside `request-insights.ts` on purpose. `patch-fetch.ts` imports
// `request-insights.ts`, so everything that module imports ships in every
// production server bundle. Only the development validation worker imports
// span batches, and `local-span-recorder.ts` is development-only tracing, so
// keeping this import here keeps the recorder out of production output.

export function importRequestInsightSpans(
  identity: RequestInsightsIdentity,
  parent: LocalSpanParent,
  batch: LocalSpanBatch
): void {
  recordSpans(
    reparentLocalSpans(
      parent,
      batch.spans.filter(shouldRecordRequestInsightSpan)
    ).map((span) => ({
      ...span,
      requestId: identity.requestId,
      requestInsightKind: identity.kind,
      requestInsightSource: identity.source,
      requestInsightProxyStatus: identity.proxyStatus,
      htmlRequestId: identity.htmlRequestId,
      url: identity.url,
    }))
  )
}
