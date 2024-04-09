import { Resource } from '@opentelemetry/resources'
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

export function register() {
  // Next.js expects you to use to register TraceProvider. It won't work if you use NodeSDK.
  // We use registered provider to create traces inside of Next.js internals.
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'next-app',
    }),
  })

  // Make sure to register you provider
  provider.register({
    propagator: {
      inject(_context, carrier, setter) {
        setter.set(carrier, 'my-test-key-1', 'my-test-value-1')
        setter.set(carrier, 'my-test-key-2', 'my-test-value-2')
      },
      extract(context) {
        // This is a noop because we don't extract in this test
        return context
      },
      fields() {
        return ['my-test-key-1', 'my-test-key-2']
      },
    },
  })
}
