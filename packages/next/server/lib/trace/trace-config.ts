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
  /**
   * Name for the default tracer instance. If not specified, will use serviceName instead.
   */
  defaultTracerName?: string
  spanProcessorConfig?: SpanProcessorConfig
}

export { SpanProcessorConfig, TraceConfig }
