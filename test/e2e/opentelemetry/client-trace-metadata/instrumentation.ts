import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { trace } from '@opentelemetry/api'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const provider = new NodeTracerProvider()
    provider.register({
      propagator: {
        inject(context, carrier, setter) {
          setter.set(carrier, 'my-test-key-1', 'my-test-value-1')
          setter.set(carrier, 'my-test-key-2', 'my-test-value-2')
          // This non-metadata-key-3 is not going to be injected into the page
          setter.set(carrier, 'non-metadata-key-3', 'non-metadata-key-3')
          setter.set(
            carrier,
            'my-parent-span-id',
            trace.getSpanContext(context)?.spanId ?? 'invariant'
          )
        },
        extract(context) {
          // This is a noop because we don't extract in this test
          return context
        },
        fields() {
          return [
            'my-parent-span-id',
            'my-test-key-1',
            'my-test-key-2',
            'non-metadata-key-3',
          ]
        },
      },
    })
  }
}
