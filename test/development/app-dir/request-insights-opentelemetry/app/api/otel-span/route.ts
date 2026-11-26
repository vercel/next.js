import { trace } from '@opentelemetry/api'

export function GET() {
  const tracer = trace.getTracer('request-insights-opentelemetry')

  const replica = tracer.startSpan('replica lookup', {
    attributes: {
      'url.full': 'https://user:pass@replica.example.com/lookup?token=secret',
      'url.query': 'token=secret',
    },
  })
  replica.end()

  const startTime = Date.now()
  tracer.startActiveSpan(
    'redis GET',
    {
      startTime,
      attributes: {
        'db.system.name': 'redis',
        'db.operation.name': 'GET',
        'db.pool.idle': 3,
        'db.query.summary': 'GET account:123',
      },
      links: [
        {
          context: replica.spanContext(),
          attributes: { 'db.link.role': 'replica' },
        },
      ],
    },
    (span) => {
      span.addEvent('redis event', { 'db.event.detail': 'cache miss' })
      span.end(startTime + 5)
    }
  )

  return Response.json({ ok: true })
}
