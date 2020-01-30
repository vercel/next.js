---
description: Learn more about the build targets used by Next.js, which decide the way your application is built and run.
---

# Build Target

Next.js supports various build targets, each changing the way your application is built and run. We'll explain each of the targets below.

## `server` target

> This is the default target, however, we highly recommend the [`serverless` target](#serverless-target). The `serverless` target enforces additional constraints to keep you in the [Pit of Success](https://blog.codinghorror.com/falling-into-the-pit-of-success/).

This target is compatible with both `next start` and [custom server](/docs/advanced-features/custom-server.md) setups (it's mandatory for a custom server).

Your application will be built and deployed as a monolith. This is the default target and no action is required on your part to opt-in.

## `serverless` target

> Deployments to [ZEIT Now](https://zeit.co) will automatically enable this target. You do not need to opt-into it yourself, but you can.

This target will make your app [Hybrid](/docs/deployment.md#hybrid-nextjs), meaning:

- Pages with blocking data requirements ([SSR](/docs/basic-features/pages.md#server-side-rendering)) will output a self-contained Serverless Function
- Pages that can be [statically generated](/docs/basic-features/pages.md#static-generation) will output HTML, that can be served statically by a CDN

This target is only compatible with `next start` or Serverless deployment platforms (like [ZEIT Now](https://zeit.co)) — you cannot use the custom server API.

To opt-into this target, set the following configuration in your `next.config.js`:

```js
module.exports = {
  target: 'serverless',
}
```

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/deployment.md">
    <b>Deployment:</b>
    <small>Compile and deploy your Next.js app to production.</small>
  </a>
</div>
