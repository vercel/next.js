type SpanProcessorConfig =
  | {
      processorType: 'simple'
    }
  | {
      processorType: 'batch'
      exportTimeoutMs?: number
      maxExportBatchSize?: number
      maxQueueSize?: number
      scheduledDelayMs?: number
    }

interface TraceConfig {
  serviceName: string
  spanProcessorConfig?: SpanProcessorConfig
}

export { SpanProcessorConfig, TraceConfig }
