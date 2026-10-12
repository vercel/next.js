---
title: exposeTestingApiInProductionBuild
description: Expose the Instant Navigation testing API in production builds for end-to-end tests.
version: experimental
related:
  title: Related
  description: Learn how to inspect and test instant navigation.
  links:
    - app/api-reference/file-conventions/route-segment-config/instant
    - app/guides/instant-navigation
---

`experimental.exposeTestingApiInProductionBuild` includes the Instant Navigation testing API in a production build. The [`instant()` helper from `@next/playwright`](/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) uses this API to pause request-time content while an end-to-end test asserts on the UI available immediately.

Enable the option only for a dedicated test build:

```ts filename="next.config.ts" switcher highlight={3,8}
import type { NextConfig } from 'next'

const exposeTestingApi = process.env.EXPOSE_TESTING_API === '1'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    exposeTestingApiInProductionBuild: exposeTestingApi,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher highlight={1,7}
const exposeTestingApi = process.env.EXPOSE_TESTING_API === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    exposeTestingApiInProductionBuild: exposeTestingApi,
  },
}

module.exports = nextConfig
```

Set the condition when running `next build`, then serve that build with `next start`:

```bash filename="Terminal"
EXPOSE_TESTING_API=1 pnpm build
pnpm start
```

Setting the condition only for `next start` does not add the testing API to an existing build.

## Reference

| Value            | Behavior                                                              |
| ---------------- | --------------------------------------------------------------------- |
| `false` or unset | Excludes the testing API from production builds. This is the default. |
| `true`           | Includes the testing API in the production build.                     |

The option requires [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents). Development builds expose the testing API automatically when Cache Components is enabled.

> **Good to know:** Do not enable this option for a user-facing production deployment. Restrict it to local production builds, preview deployments, or other environments used for end-to-end tests.

## Version History

| Version   | Changes                                                      |
| --------- | ------------------------------------------------------------ |
| `v16.2.0` | `experimental.exposeTestingApiInProductionBuild` introduced. |
