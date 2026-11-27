import { NodeSDK } from '@opentelemetry/sdk-node'

const sdk = new NodeSDK({
  spanProcessors: [
    {
      onStart() {},
      onEnd(span) {
        // Azure Monitor's span metrics read Date.now() from onEnd. Reproduce
        // that behavior without an exporter or an external telemetry service.
        const before = Date.now()
        const random = Math.random()
        void Promise.resolve().then(() => {
          console.log(
            'SPAN_END:' +
              JSON.stringify({
                name: span.name,
                type: span.attributes['next.span_type'],
                before,
                random,
                after: Date.now(),
                date: new Date().toISOString(),
              })
          )
        })
      },
      forceFlush: async () => {},
      shutdown: async () => {},
    },
  ],
})

sdk.start()
