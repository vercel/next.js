---
description: Learn how to opt-in and out of ESLint during development mode and production builds.
---

# ESLint Warnings and Errors

## During builds

Next.js fails your **production build** (`next build`) when ESLint errors are present in your
project.

If you'd like Next.js to dangerously produce production code even when your application has errors,
you can disable ESLint running during the build process.

> It's recommended to run ESLint as part of the production build process to ensure your application
> is resilient against runtime issues.

Open `next.config.js` and disable the `build` option in the `eslint` config:

```js
module.exports = {
  eslint: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has ESLint errors.
    // !! WARN !!
    build: false,
  },
}
```

## During development

By default, Next.js does not run ESLint during **development** (`next dev`).

If you would like Next.js to lint files separately in development mode, you can enable it in your
configuration.

> Enabling ESLint during development mode will slow down how fast pages are compiled. Until this is
> optimized, we recommend that you [integrate ESLint in your code
> editor](https://eslint.org/docs/user-guide/integrations#editors).

Open `next.config.js` and enable the `dev` option in the `eslint` config:

```js
module.exports = {
  eslint: {
    // !! WARN !!
    // This can slow down how long pages take to compile during development
    // !! WARN !!
    dev: true,
  },
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
  <a href="/docs/basic-features/eslint.md">
    <b>ESLint:</b>
    <small>Learn more about how to use ESLint in Next.js.</small>
  </a>
</div>
