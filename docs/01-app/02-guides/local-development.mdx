---
title: How to optimize your local development environment
nav_title: Development Environment
description: Learn how to optimize your local development environment with Next.js.
---

Next.js is designed to provide a great developer experience. As your application grows, you might notice slower compilation times during local development. This guide will help you identify and fix common compile-time performance issues.

## Local dev vs. production

The development process with `next dev` is different than `next build` and `next start`.

`next dev` compiles routes in your application as you open or navigate to them. This enables you to start the dev server without waiting for every route in your application to compile, which is both faster and uses less memory. Running a production build applies other optimizations, like minifying files and creating content hashes, which are not needed for local development.

## Improving local dev performance

### 1. Check your computer's antivirus

Antivirus software can slow down file access. While this is more common on Windows machines, this can be an issue for any system with an antivirus tool installed.

On Windows, you can add your project to the [Microsoft Defender Antivirus exclusion list](https://support.microsoft.com/en-us/windows/virus-and-threat-protection-in-the-windows-security-app-1362f4cd-d71a-b52a-0b66-c2820032b65e#bkmk_threat-protection-settings).

1. Open the **"Windows Security"** application and then select **"Virus & threat protection"** &rarr; **"Manage settings"** &rarr; **"Add or remove exclusions"**.
2. Add a **"Folder"** exclusion. Select your project folder.

On macOS, you can disable [Gatekeeper](https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web) inside of your terminal.

1. Run `sudo spctl developer-mode enable-terminal` in your terminal.
2. Open the **"System Settings"** app and then select **"Privacy & Security"** &rarr; **"Developer Tools"**.
3. Ensure your terminal is listed and enabled. If you're using a third-party terminal like iTerm or Ghostty, add that to the list.
4. Restart your terminal.

<Image
  alt="Screenshot of macOS System Settings showing the Privacy & Security pane"
  srcLight="/docs/light/macos-gatekeeper-privacy-and-security.png"
  srcDark="/docs/dark/macos-gatekeeper-privacy-and-security.png"
  width="723"
  height="250"
/>

<Image
  alt="Screenshot of macOS System Settings showing the Developer Tools options"
  srcLight="/docs/light/macos-gatekeeper-developer-tools.png"
  srcDark="/docs/dark/macos-gatekeeper-developer-tools.png"
  width="723"
  height="250"
/>

If you or your employer have configured any other Antivirus solutions on your system, you should inspect the relevant settings for those products.

### 2. Update Next.js and use Turbopack

Make sure you're using the latest version of Next.js. Each new version often includes performance improvements.

Turbopack is now the default bundler for Next.js development and provides significant performance improvements over webpack.

```bash
npm install next@latest
npm run dev  # Turbopack is used by default
```

If you need to use Webpack instead of Turbopack, you can opt-in:

```bash
npm run dev --webpack
```

[Learn more about Turbopack](/blog/turbopack-for-development-stable). See our [upgrade guides](/docs/app/guides/upgrading) and codemods for more information.

### 3. Check your imports

The way you import code can greatly affect compilation and bundling time. Learn more about [optimizing package bundling](/docs/app/guides/package-bundling) and explore tools like [Dependency Cruiser](https://github.com/sverweij/dependency-cruiser) or [Madge](https://github.com/pahen/madge).

#### Icon libraries

Libraries like `@material-ui/icons`, `@phosphor-icons/react`, or `react-icons` can import thousands of icons, even if you only use a few. Try to import only the icons you need:

```jsx
// Instead of this:
import { TriangleIcon } from '@phosphor-icons/react'

// Do this:
import { TriangleIcon } from '@phosphor-icons/react/dist/csr/Triangle'
```

You can often find what import pattern to use in the documentation for the icon library you're using. This example follows [`@phosphor-icons/react`](https://www.npmjs.com/package/@phosphor-icons/react#import-performance-optimization) recommendation.

Libraries like `react-icons` includes many different icon sets. Choose one set and stick with that set.

For example, if your application uses `react-icons` and imports all of these:

- `pi` (Phosphor Icons)
- `md` (Material Design Icons)
- `tb` (tabler-icons)
- `cg` (cssgg)

Combined they will be tens of thousands of modules that the compiler has to handle, even if you only use a single import from each.

#### Barrel files

"Barrel files" are files that export many items from other files. They can slow down builds because the compiler has to parse them to find if there are side-effects in the module scope by using the import.

Try to import directly from specific files when possible. [Learn more about barrel files](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) and the built-in optimizations in Next.js.

#### Optimize package imports

Next.js can automatically optimize imports for certain packages. If you are using packages that utilize barrel files, add them to your `next.config.js`:

```jsx
module.exports = {
  experimental: {
    optimizePackageImports: ['package-name'],
  },
}
```

Turbopack automatically analyzes imports and optimizes them. It does not require this configuration.

### 4. Check your Tailwind CSS setup

If you're using Tailwind CSS, make sure it's set up correctly.

A common mistake is configuring your `content` array in a way which includes `node_modules` or other large directories of files that should not be scanned.

Tailwind CSS version 3.4.8 or newer will warn you about settings that might slow down your build.

1. In your `tailwind.config.js`, be specific about which files to scan:

   ```jsx
   module.exports = {
     content: [
       './src/**/*.{js,ts,jsx,tsx}', // Good
       // This might be too broad
       // It will match `packages/**/node_modules` too
       // '../../packages/**/*.{js,ts,jsx,tsx}',
     ],
   }
   ```

2. Avoid scanning unnecessary files:

   ```jsx
   module.exports = {
     content: [
       // Better - only scans the 'src' folder
       '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
     ],
   }
   ```

### 5. Check custom webpack settings

If you've added custom webpack settings, they might be slowing down compilation.

Consider if you really need them for local development. You can optionally only include certain tools for production builds, or explore using the default Turbopack bundler and configuring [loaders](/docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders) instead.

### 6. Optimize memory usage

If your app is very large, it might need more memory.

[Learn more about optimizing memory usage](/docs/app/guides/memory-usage).

### 7. Server Components and data fetching

Changes to Server Components cause the entire page to re-render locally in order to show the new changes, which includes fetching new data for the component.

The experimental `serverComponentsHmrCache` option allows you to cache `fetch` responses in Server Components across Hot Module Replacement (HMR) refreshes in local development. This results in faster responses and reduced costs for billed API calls.

[Learn more about the experimental option](/docs/app/api-reference/config/next-config-js/serverComponentsHmrCache).

### 8. Consider local development over Docker

If you're using Docker for development on Mac or Windows, you may experience significantly slower performance compared to running Next.js locally.

Docker's filesystem access on Mac and Windows can cause Hot Module Replacement (HMR) to take seconds or even minutes, while the same application runs with fast HMR when developed locally.

This performance difference is due to how Docker handles filesystem operations outside of Linux environments. For the best development experience:

- Use local development (`npm run dev` or `pnpm dev`) instead of Docker during development
- Reserve Docker for production deployments and testing production builds
- If you must use Docker for development, consider using Docker on a Linux machine or VM

[Learn more about Docker deployment](/docs/app/getting-started/deploying#docker) for production use.

## Tools for finding problems

### Detailed fetch logging

Use the `logging.fetches` option in your `next.config.js` file, to see more detailed information about what's happening during development:

```js
module.exports = {
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
}
```

[Learn more about fetch logging](/docs/app/api-reference/config/next-config-js/logging).

### Turbopack tracing

Turbopack tracing is a tool that helps you understand the performance of your application during local development.
It provides detailed information about the time taken for each module to compile and how they are related.

1. Make sure you have the latest version of Next.js installed.
1. Generate a Turbopack trace file:

   ```bash
   NEXT_TURBOPACK_TRACING=1 npm run dev
   ```

1. Navigate around your application or make edits to files to reproduce the problem.
1. Stop the Next.js development server.
1. A file called `trace-turbopack` will be available in the `.next/dev` folder.
1. You can interpret the file using `npx next internal trace [path-to-file]`:

   ```bash
   npx next internal trace .next/dev/trace-turbopack
   ```

   On versions where `trace` is not available, the command was named `turbo-trace-server`:

   ```bash
   npx next internal turbo-trace-server .next/dev/trace-turbopack
   ```

1. Once the trace server is running you can view the trace at https://trace.nextjs.org/.
1. By default the trace viewer will aggregate timings, in order to see each individual time you can switch from "Aggregated in order" to "Spans in order" at the top right of the viewer.

> **Good to know**: The trace file is place under the development server directory, which defaults to `.next/dev`. This is controllable using the [`isolatedDevBuild`](/docs/app/api-reference/config/next-config-js/isolatedDevBuild) flag in your Next config file.

### Still having problems?

Share the trace file generated in the [Turbopack Tracing](#turbopack-tracing) section and share it on [GitHub Discussions](https://github.com/vercel/next.js/discussions) or [Discord](https://nextjs.org/discord).
