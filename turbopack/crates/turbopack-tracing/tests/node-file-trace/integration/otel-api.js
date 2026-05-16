const { trace } = require('@opentelemetry/api')

void trace.getTracer('test').startSpan('test')
