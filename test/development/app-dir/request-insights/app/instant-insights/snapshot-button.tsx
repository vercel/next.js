'use client'

import { dispatcher } from 'next/dist/compiled/next-devtools'

export function EmitRequestInsightsSnapshot() {
  return (
    <button
      id="emit-request-insights-snapshot"
      onClick={() => {
        const startTime = Date.now()
        dispatcher.onRequestInsightsSnapshot({
          requests: [
            ...Array.from({ length: 40 }, (_, index) => ({
              requestId: `synthetic-request-${index}`,
              kind: 'request' as const,
              source: 'page' as const,
              htmlRequestId: `synthetic-document-${index}`,
              route: `/synthetic-${index}`,
              url: `/synthetic-${index}`,
              startTime: startTime + index,
              durationMs: index + 1,
              status: 'ok' as const,
              spans: [],
              fetches: [],
            })),
            {
              requestId: 'synthetic-internal-request',
              kind: 'instant-insights',
              source: 'instant-insights',
              htmlRequestId: 'synthetic-internal-document',
              route: '/synthetic-internal',
              url: '/synthetic-internal',
              startTime: startTime + 40,
              durationMs: 1,
              status: 'ok',
              spans: [],
              fetches: [],
            },
          ],
        })
      }}
      type="button"
    >
      Emit Request Insights snapshot
    </button>
  )
}
