import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { createRequestInsightsSpanProcessor } from 'next/experimental/request-insights'

new NodeTracerProvider({
  spanProcessors: [createRequestInsightsSpanProcessor()],
}).register()
