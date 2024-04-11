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
          setter.set(
            carrier,
            'my-parent-span-id',
            trace.getSpanContext(context).spanId
          )
        },
        extract(context) {
          // This is a noop because we don't extract in this test
          return context
        },
        fields() {
          return ['my-parent-span-id', 'my-test-key-1', 'my-test-key-2']
        },
      },
    })
  }
}
