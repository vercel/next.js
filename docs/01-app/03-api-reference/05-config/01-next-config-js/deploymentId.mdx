---
title: deploymentId
description: Configure a deployment identifier used for version skew protection and cache busting.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

The `deploymentId` option allows you to set an identifier for your deployment. This identifier is used for [version skew](/docs/app/guides/self-hosting#version-skew) protection and cache busting during rolling deployments.

```js filename="next.config.js"
module.exports = {
  deploymentId: 'my-deployment-id',
}
```

You can also set the deployment ID using the `NEXT_DEPLOYMENT_ID` environment variable:

```bash
NEXT_DEPLOYMENT_ID=my-deployment-id next build
```

> **Good to know:** If both are set, the `deploymentId` value in `next.config.js` takes precedence over the `NEXT_DEPLOYMENT_ID` environment variable.

## How it works

When a `deploymentId` is configured, Next.js:

1. Appends `?dpl=<deploymentId>` to static asset URLs (JavaScript, CSS, images)
2. Adds an `x-deployment-id` header to client-side navigation requests
3. Adds an `x-nextjs-deployment-id` header to navigation responses
4. Injects a `data-dpl-id` attribute on the `<html>` element

When the client detects a mismatch between its deployment ID and the server's (via the response header), it triggers a hard navigation (full page reload) instead of a client-side navigation. This ensures users always receive assets <AppOnly>and Server Functions</AppOnly> from a consistent deployment version.

> **Good to know:** Next.js does not read the `?dpl=` query parameter on incoming requests. The query parameter is for cache busting (ensuring browsers and CDNs fetch fresh assets), not for routing. If you need version-aware routing, consult your hosting provider or CDN's documentation for implementing deployment-based routing.

## Use cases

### Rolling deployments

During a rolling deployment, some server instances may be running the new version while others are still running the old version. Without a deployment ID, users might receive a mix of old and new assets, causing errors.

Setting a consistent `deploymentId` per deployment ensures:

<AppOnly>

- Clients always request assets from a matching deployment version
- Mismatches trigger a full reload to fetch the correct assets
- Server Functions work correctly across deployment boundaries

</AppOnly>

<PagesOnly>

- Clients always request assets from a matching deployment version
- Mismatches trigger a full reload to fetch the correct assets

</PagesOnly>

### Multi-server environments

When running multiple instances of your Next.js application behind a load balancer, all instances for the same deployment should use the same `deploymentId`.

```js filename="next.config.js"
module.exports = {
  deploymentId: process.env.DEPLOYMENT_VERSION || process.env.GIT_SHA,
}
```

## Version History

| Version    | Changes                                               |
| ---------- | ----------------------------------------------------- |
| `v14.1.4`  | `deploymentId` stabilized as top-level config option. |
| `v13.4.10` | `experimental.deploymentId` introduced.               |

## Related

- [Self-Hosting - Version Skew](/docs/app/guides/self-hosting#version-skew)
- [generateBuildId](/docs/app/api-reference/config/next-config-js/generateBuildId)
