---
title: instrumentationClientInject
description: Inject additional client-side instrumentation modules before the user's `instrumentation-client.{js,ts}` file.
---

`instrumentationClientInject` is a list of modules that are imported on the client for their side effects before the user's [`instrumentation-client.{js,ts}`](/docs/app/api-reference/file-conventions/instrumentation-client) file runs, ahead of React hydration.

This option is primarily intended for **`next.config.js` plugins** (for example, wrappers like `withSentry` or `withAnalytics` that extend a project's config). It lets such a plugin inject its own client instrumentation module — including a navigation hook — without requiring every project to author or modify an `instrumentation-client` file. Application code should generally continue to use the [`instrumentation-client.{js,ts}`](/docs/app/api-reference/file-conventions/instrumentation-client) file convention directly.

A plugin typically appends its own module to whatever the project already has configured:

```js filename="withMyInstrumentation.js"
module.exports = function withMyInstrumentation(nextConfig = {}) {
  return {
    ...nextConfig,
    instrumentationClientInject: [
      ...(nextConfig.instrumentationClientInject ?? []),
      'my-instrumentation-package/client',
    ],
  }
}
```

It can also be set directly:

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
module.exports = {
  instrumentationClientInject: [
    'my-analytics-package',
    './lib/sentry-client.js',
  ],
}
```

Each entry is one of:

- A bare npm package name, resolved from the project's `node_modules`.
- A path relative to the project root.

## Execution order

Modules run on the client in this order:

1. Each entry in `instrumentationClientInject`, in array order.
2. The project's `instrumentation-client.{js,ts}` file, if present.
3. React hydration.

## Router navigation hook

Each injected module may optionally export an `onRouterTransitionStart` function with the same signature as the one documented for the [`instrumentation-client` file convention](/docs/app/api-reference/file-conventions/instrumentation-client#router-navigation-tracking). Next.js composes a single hook that fans out to every exported `onRouterTransitionStart` on each navigation, calling them in array order, with the user file's hook running last.

```js filename="lib/sentry-client.js"
// Side-effectful setup runs at load time.
setupSentry()

export function onRouterTransitionStart(url, navigationType) {
  recordNavigationBreadcrumb(url, navigationType)
}
```

Modules that do not export `onRouterTransitionStart` are skipped during navigation.

## Version history

| Version   | Changes                                  |
| --------- | ---------------------------------------- |
| `v16.3.0` | `instrumentationClientInject` introduced |
