---
title: useTypeScriptCli
description: Run the project-local TypeScript CLI for type checking during production builds.
version: experimental
---

The `experimental.useTypeScriptCli` option makes `next build` run the project-local `tsc` command instead of loading the TypeScript JavaScript compiler API. You can use this option with TypeScript 6, and it enables [TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) support while its JavaScript API is unavailable.

Install TypeScript 7 in your project:

```bash package="pnpm"
pnpm add -D typescript@^7
```

```bash package="npm"
npm install -D typescript@^7
```

```bash package="yarn"
yarn add -D typescript@^7
```

```bash package="bun"
bun add -D typescript@^7
```

Then, explicitly enable the CLI checker:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
}

module.exports = nextConfig
```

Next.js does not select the CLI checker automatically. If TypeScript 7 is installed without this option, `next build` exits with instructions to enable it or install a TypeScript version supported by the default checker.

## Behavior

- Next.js continues to generate `next-env.d.ts` and route types and to apply its recommended `tsconfig` settings before running the checker.
- TypeScript diagnostics are printed directly from `tsc`. Next.js-specific code frames and error rewriting are not applied.
- The complete project selected by the configured `tsconfig` file is checked, including test files and `.next/dev/types` when included. The [`--debug-build-paths`](/docs/app/api-reference/cli/next#next-build-options) option does not limit this set and produces a warning when combined with the CLI checker.
- [`typescript.tsconfigPath`](/docs/app/api-reference/config/typescript#custom-tsconfig-path) selects the project passed to `tsc`.
- [`typescript.ignoreBuildErrors`](/docs/app/api-reference/config/typescript#disabling-typescript-errors-in-production) skips the type-checking step, including the CLI checker.

Learn more about [using TypeScript 7 with Next.js](/docs/app/api-reference/config/typescript#using-typescript-7).
