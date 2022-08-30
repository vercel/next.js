type SpanProcessorConfig =
  | {
      processorType: 'simple'
    }
  | {
      processorType: 'batch'
      exportTimeoutMillis?: number
      maxExportBatchSize?: number
      maxQueueSize?: number
      scheduledDelayMillis?: number
    }

interface TraceConfig {
  serviceName: string
  /**
   * Name for the default tracer instance. If not specified, will use serviceName instead.
   */
  defaultTracerName?: string
  spanProcessorConfig?: SpanProcessorConfig
  /**
   * Enable console span processor to emit spans into console instead.
   * This will DISABLE exporter to actually send spans into collector.
   */
  debug?: boolean
}

export { SpanProcessorConfig, TraceConfig }
