---
description: Learn how instrument your Next.js app with OpenTelemetry
---

# Observability in Next.js

Next.js is a popular React-based framework for building server-side rendered and static websites. It comes with built-in support for OpenTelemetry, an observability framework for collecting, processing, and exporting telemetry data. With Next.js and OpenTelemetry, developers can easily monitor and diagnose issues with their applications in real-time.

This document will provide an overview of how to leverage the built-in OpenTelemetry support in Next.js to enable observability in your applications.

## Getting Started with OpenTelemetry in Next.js

To get started with OpenTelemetry in Next.js, you need to install the necessary packages. Run the following command to install the required packages:

```bash
npm install @opentelemetry/core @opentelemetry/web @opentelemetry/plugin-xml-http-request @opentelemetry/plugin-document-load @opentelemetry/exporter-collector-proto @opentelemetry/exporter-zipkin
```

This will install the OpenTelemetry core package, as well as plugins for XML HTTP requests and document loads. It also includes exporters for sending telemetry data to a collector or Zipkin.

Next, you need to create an OpenTelemetry tracer and start it. You can do this in your pages/\_app.js file, which is the entry point for your Next.js application.

```javascript
import { NodeTracerProvider } from '@opentelemetry/node'
import { SimpleSpanProcessor } from '@opentelemetry/tracing'
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin'

const provider = new NodeTracerProvider()

provider.addSpanProcessor(
  new SimpleSpanProcessor(
    new ZipkinExporter({
      serviceName: 'my-next-app',
    })
  )
)

provider.register()
```

This code creates an OpenTelemetry Node.js tracer provider, adds a simple span processor, and registers it. The span processor exports the telemetry data to a Zipkin exporter, which sends it to a Zipkin server.

Collecting and Exporting Telemetry Data
Next.js and OpenTelemetry make it easy to collect and export telemetry data from your application. You can use the @opentelemetry/web package to instrument your client-side code, and the @opentelemetry/plugin-xml-http-request package to instrument your XML HTTP requests.

javascript
Copy code
import { trace } from '@opentelemetry/web';
import { XMLHttpRequestPlugin } from '@opentelemetry/plugin-xml-http-request';

trace.setGlobalTracerProvider(provider);
trace.getTracer('my-next-app');

const xmlHttpRequestPlugin = new XMLHttpRequestPlugin();
xmlHttpRequestPlugin.enable();
This code enables tracing for client-side code and XML HTTP requests by setting the global tracer provider and enabling the XML HTTP request plugin. You can also use the @opentelemetry/plugin-document-load package to instrument your document loads.

javascript
Copy code
import { DocumentLoadPlugin } from '@opentelemetry/plugin-document-load';

const documentLoadPlugin = new DocumentLoadPlugin();
documentLoadPlugin.enable();
This code enables tracing for document loads by enabling the document load plugin.

Viewing Telemetry Data
Once you have collected and exported telemetry data, you can view it in a variety of tools. You can use the OpenTelemetry collector to send data to various backend services, including Jaeger, Prometheus, and ElasticSearch.

javascript
Copy code
import { CollectorTraceExporter } from '@opentelemetry/exporter-collector-proto';

const exporter = new CollectorTraceExporter({
url: 'http://my-opentelemetry-collector:55678/v1/trace',
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
This code creates a collector trace exporter that sends the telemetry data to a collector running at `http://my-opentelemetry-collector:55678/v1/
