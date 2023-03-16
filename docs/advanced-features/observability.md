---
description: Learn how instrument your Next.js app with OpenTelemetry.
---

> **Note**: This feature is experimental, you need to explicitly opt-in by providing `experimental.instrumentationHook = true;` in your `next.config.js`.

### Specify the Preview Mode duration

# Observability in Next.js

Observability is crucial for understanding and optimizing the behavior and performance of modern web applications built with Next.js. As applications become more complex, it becomes increasingly difficult to identify and diagnose issues that may arise. By leveraging observability tools such as logging and metrics, developers can gain insights into their application's behavior and identify areas for optimization. With observability, developers can proactively address issues before they become major problems and provide a better user experience. Therefore, it is highly recommended to use observability in your Next.js applications to improve performance, optimize resources, and enhance user experience.

## Getting Started with OpenTelemetry in Next.js

Next.js supports OpenTelemetry which allows you to easily change your observability provider without changing your code.

Firstly you need to install required packages:

```bash
npm install @opentelemetry/api @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/sdk-trace-base @opentelemetry/semantic-conventions
```

Next, you need to provide a `register` function that initializes OpenTelemetry tracer. We recommend using two files, in order to import OpenTelemetry dependencies in the correct environment.

```ts
// instrumentation.ts

export function register() {
  // We need to make sure that we import these files only in Node.js environment.
  // OpenTelemetry is **not** supported on Edge or Client side at the moment.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    require('./instrumentation-node')
  }
}
```

```ts
// instrumentation-node.ts

import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node'

// You can use gRPC exporter instead
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

// Next.js expects you to use to register TraceProvider. It won't work if you use NodeSDK.
// We use registered provider to create traces inside of Next.js internals.
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'next-app',
  }),
})

provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter({})))

// Make sure to register you provider
provider.register()
```

> **Note**: We have created a simple [with-opentelemetry](https://github.com/vercel/next.js/tree/canary/examples/with-opentelemetry) example that you can use.

### Specify the Preview Mode duration

## Testing your instrumentation

In order to display your instrumentation you will need a OpenTelemetry collector with a compatible backend. We recommend using our [OpenTelemetry dev environment](https://github.com/vercel/opentelemetry-collector-dev-setup).
