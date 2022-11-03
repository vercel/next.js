---
description: Turbopack (alpha) can be used inside Next.js 13 for 700x faster updatse.
---

# Turbopack (alpha)

[Turbopack](https://turbo.build/pack) is an incremental bundler optimized for JavaScript and TypeScript, written in Rust, and built into Next.js 13.

On large applications Turbopack updates 10x faster than Vite and 700x faster than Webpack. For the biggest applications, the difference is even larger with updates up to 20x faster than Vite.

## Usage

Turbopack can be used in Next.js 13 in both the `pages` and `app` directories:

1. Create a Next.js 13 project with Turbopack

```bash
npx create-next-app --example with-turbopack
```

2. Start the Next.js development server (with Turbopack)

```bash
next dev --turbo
```

## Supported Features

To learn more about the currently supported features for Turbopack, view the [documentation](https://turbo.build/pack/docs/features).
