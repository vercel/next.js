// Disable automatic instrumentation
process.env.OTEL_NO_PATCH_MODULES = '*'

const { NodeTracerProvider } = require('@opentelemetry/node')
const { SimpleSpanProcessor } = require('@opentelemetry/tracing')
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin')

const tracerProvider = new NodeTracerProvider({
  // All automatic instrumentation plugins have to be disabled as it affects worker_thread/child_process bootup performance
  plugins: {
    mongodb: { enabled: false, path: '@opentelemetry/plugin-mongodb' },
    grpc: { enabled: false, path: '@opentelemetry/plugin-grpc' },
    '@grpc/grpc-js': { enabled: false, path: '@opentelemetry/plugin-grpc-js' },
    http: { enabled: false, path: '@opentelemetry/plugin-http' },
    https: { enabled: false, path: '@opentelemetry/plugin-https' },
    mysql: { enabled: false, path: '@opentelemetry/plugin-mysql' },
    pg: { enabled: false, path: '@opentelemetry/plugin-pg' },
    redis: { enabled: false, path: '@opentelemetry/plugin-redis' },
    ioredis: { enabled: false, path: '@opentelemetry/plugin-ioredis' },
    'pg-pool': { enabled: false, path: '@opentelemetry/plugin-pg-pool' },
    express: { enabled: false, path: '@opentelemetry/plugin-express' },
    '@hapi/hapi': {
      enabled: false,
      path: '@opentelemetry/hapi-instrumentation',
    },
    koa: { enabled: false, path: '@opentelemetry/koa-instrumentation' },
    dns: { enabled: false, path: '@opentelemetry/plugin-dns' },
  },
})

tracerProvider.addSpanProcessor(
  new SimpleSpanProcessor(
    new ZipkinExporter({
      serviceName: 'next-js',
    })
  )
)

tracerProvider.register()
