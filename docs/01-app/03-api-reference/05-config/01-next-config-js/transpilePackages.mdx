---
title: transpilePackages
description: Transpile and bundle dependencies from monorepo workspace packages or `node_modules` libraries that ship TypeScript, JSX, or modern syntax.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

Use `transpilePackages` to compile and bundle a dependency instead of treating it as untouched runtime code. Values are package names, including scoped names like `@scope/pkg`. Paths and glob patterns are not supported.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['package-name', '@scope/pkg'],
}

module.exports = nextConfig
```

This replaces the `next-transpile-modules` package.

## When you need it

Turbopack transpiles workspace packages (npm, pnpm, or Yarn workspaces) in your monorepo automatically under both routers. Webpack does the same for the App Router. Add a package to `transpilePackages` when:

- **A `node_modules` dependency ships raw TypeScript or JSX.** Next.js does not compile code inside `node_modules` by default. Listing the package opts it in, or you can build the package to plain JavaScript and point its `main`/`exports` at the compiled output.
- **You build with webpack for the Pages Router and the dependency's source lives outside the next app's directory.** For example, an `apps/web` app importing `packages/ui` in the same monorepo.
- **You use the Pages Router and want a `node_modules` dependency bundled into the route.** Pages Router loads `node_modules` server-side dependencies through Node.js `require` at runtime. List the package to bundle its source into the route instead. App Router already bundles Server Component and Route Handler dependencies unless the package is listed in [`serverExternalPackages`](/docs/app/api-reference/config/next-config-js/serverExternalPackages).

> **Good to know**: A package cannot appear in both `transpilePackages` and [`serverExternalPackages`](/docs/app/api-reference/config/next-config-js/serverExternalPackages); Next.js throws at build start if it does. Packages listed in [`optimizePackageImports`](/docs/app/api-reference/config/next-config-js/optimizePackageImports) and the entries in [`default-transpiled-packages.json`](https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/default-transpiled-packages.json) are added automatically; you do not need to repeat them.

## Version History

| Version   | Changes                    |
| --------- | -------------------------- |
| `v13.0.0` | `transpilePackages` added. |
