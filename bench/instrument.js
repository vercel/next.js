const { NodeTracerProvider } = require('@opentelemetry/node')
const { BatchSpanProcessor } = require('@opentelemetry/tracing')
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin')

const tracerProvider = new NodeTracerProvider()

tracerProvider.addSpanProcessor(
  new BatchSpanProcessor(
    new ZipkinExporter({
      serviceName: 'next-js',
    })
  )
)

tracerProvider.register()
