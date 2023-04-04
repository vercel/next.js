---
description: Learn how instrument your Next.js app with OpenTelemetry.
---

> **Note**: This feature is experimental, you need to explicitly opt-in by providing `experimental.instrumentationHook = true;` in your `next.config.js`.

# OpenTelemetry in Next.js

Observability is crucial for understanding and optimizing the behavior and performance of your Next.js app.

As applications become more complex, it becomes increasingly difficult to identify and diagnose issues that may arise. By leveraging observability tools, such as logging and metrics, developers can gain insights into their application's behavior and identify areas for optimization. With observability, developers can proactively address issues before they become major problems and provide a better user experience. Therefore, it is highly recommended to use observability in your Next.js applications to improve performance, optimize resources, and enhance user experience.

We recommend using OpenTelemetry for instrumenting your apps.
It's a platform agnostic way to instrument apps that allows you to change your observability provider without changing your code.
Read [Official OpenTelemetry docs](https://opentelemetry.io/docs/) for more information about OpenTelemetry and how it works.

This documentation uses terms like _Span_, _Trace_ or _Exporter_ throughout this doc, all of which can be found in [the OpenTelemetry Observability Primer](https://opentelemetry.io/docs/concepts/observability-primer/).

Next.js supports OpenTelemetry instrumentation out of the box, that means that we already instrumented Next.js itself.
When you enable OpenTelemetry you we will automatically wrap all your code like `getStaticProps` in a _spans_ with helpful attributes.

> **Note:** We currently support OpenTelemetry bindings only in serverless functions.
> We don't provide any for `edge` or client side code.

## Getting Started

To get started, you must install the required packages:

```bash
npm install @vercel/otel
```

Next, create a custom [`instrumentation.ts`](./instrumentation.md) file in the root of the project:

```ts
// instrumentation.ts
import { registerOTel } from '@vercel/otel'

export function register() {
  registerOTel('next-app')
}
```

> **Note**: We have created a basic [with-opentelemetry](https://github.com/vercel/next.js/tree/canary/examples/with-opentelemetry) example that you can use.

## Testing your instrumentation

You need a OpenTelemetry collector with a compatible backend to test OpenTelemetry traces locally.
We recommend using our [OpenTelemetry dev environment](https://github.com/vercel/opentelemetry-collector-dev-setup).

If everything works well you should be able to see the root server span labeled as `GET /requested/pathname`.
All other spans from that particular trace will be nested under it.

Next.js traces more spans than are emitted by default.
To see more spans, you must set `NEXT_OTEL_VERBOSE=1`.

## Custom Spans

OpenTelemetry enables you to add your own custom spans to trace using official OpenTelemetry APIs.
Our package `@vercel/otel` exports everything from `@opentelemetry/api` so you don't need to install anything.

The following example demonstrates a function that fetches GitHub stars and adds a custom `fetchGithubStars` span to track the fetch request's result:

```ts
import { trace } from '@vercel/otel'

export async function fetchGithubStars() {
  return await trace
    .getTracer('nextjs-example')
    .startActiveSpan('fetchGithubStars', async (span) => {
      try {
        return await getValue()
      } finally {
        span.end()
      }
    })
}
```

More documentation can be found in [OpenTelemetry docs](https://opentelemetry.io/docs/instrumentation/js/instrumentation/).

The `register` function will execute before your code runs in a new environment.
You can start creating new spans, and they should be correctly added to the exported trace.

## Custom register function

We have created `@vercel/otel` to make it easier to get started with OpenTelemetry. But this package won't be able to satisfy some advanced setups. You can always use OpenTelemetry APIs directly.

In order to be able to leverage instrumentation provided by next.js you will need to setup and register custom [TraceProvider](https://opentelemetry.io/docs/reference/specification/trace/api/#tracerprovider).

> **Note**: `instrumentation.ts` get's called in both `edge` and `nodejs` runtime. You need to make sure that you are initializing OpenTelemetry only in `nodejs` runtime. OpenTelemetry APIs are not available on `edge`.

## Default Spans in Next.js

Next.js automatically instruments several spans for you to provide useful insights into your application's performance.

All spans have these attributes:

- `next.span_name`: this is name the of the span
- `next.span_type`: this is unique identifier for particular span

Here's a list of default spans provided by Next.js:

### `[http.method] [next.route]`

This span represents the root span for each incoming request to your Next.js application. It tracks the HTTP method, route, target, and status code of the request.

Attributes:

- `http.method`: The HTTP method of the request (e.g., GET, POST).
- `http.route`: Same as `next.route`.
- `http.status_code`: The HTTP status code of the response.
- `http.target`: The actual requested path (e.g., `/value/user`).
- `next.route`: The route pattern of the request (e.g., `/[param]/user`).
- `next.span_type`: `BaseServer.handleRequest`

### `render route (app) [next.route]`

This span represents the process of rendering a route in the application.

Attributes:

- `next.route`: The route pattern of the request (e.g., `/[param]/user`).
- `next.span_type`: `AppRender.getBodyResult`.

### `fetch [http.method] [http.url]`

This span represents the fetch request executed in your code.

Attributes:

- `http.method`: The HTTP method of the fetch request (e.g., GET).
- `http.url`: The URL of the fetch request (e.g., `https://vercel.com/`).
- `net.peer.name`: The domain name of the fetch request (e.g., `vercel.com`).
- `next.span_type`: `AppRender.fetch`

### `executing api route (app) [next.route]`

This span represents the execution of an API route handler in the application.

Attributes:

- `next.route`: The route pattern of the request (e.g., `/[param]/getUser`).
- `next.span_type`: `AppRouteRouteHandlers.runHandler`.

### `getServerSideProps [next.route]`

This span represents the execution of `getServerSideProps` for a specific route.

Attributes:

- `next.route`: The route pattern of the request (e.g., `/[param]/user`).
- `next.span_type`: `Render.getServerSideProps`.

### `getStaticProps [next.route]`

This span represents the execution of `getStaticProps` for a specific route.

Attributes:

- `next.route`: The route pattern of the request (e.g., `/[param]/user`).
- `next.span_type`: `Render.getStaticProps`.

### `render route (pages) [next.route]`

This span represents the process of rendering the document for a specific route.

Attributes:

- `next.route`: The route pattern of the request (e.g., `/[param]/user`).
- `next.span_type`: `Render.renderDocument`.

### `generateMetadata [next.page]`

This span represents the process of generating metadata for a specific route.

Attributes:

- `next.page`: The page pattern for which the metadata is generated (e.g., `/app/[param]/layout` or `/app/[param]/page`).
- `next.span_type`: `ResolveMetadata.generateMetadata`.
