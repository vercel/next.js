import api from '@opentelemetry/api'

export const tracer = api.trace.getTracer('next', process.env.__NEXT_VERSION)
