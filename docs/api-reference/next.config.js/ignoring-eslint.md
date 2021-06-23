---
description: Next.js reports ESLint errors and warnings during builds by default. Learn how to opt-out of this behavior here.
---

# Ignoring ESLint

When ESLint is detected in your project, Next.js fails your **production build** (`next build`) when errors are present.

If you'd like Next.js to dangerously produce production code even when your application has ESLint errors, you can disable the built-in linting step completely.

> Be sure you have configured ESLint to run in a separate part of your workflow (for example, in CI or a pre-commit hook).

Open `next.config.js` and enable the `ignoreDuringBuilds` option in the `eslint` config:

```js
module.exports = {
  eslint: {
    // Warning: Dangerously allow production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
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
    <small>Get started with ESLint in Next.js.</small>
  </a>
</div>
