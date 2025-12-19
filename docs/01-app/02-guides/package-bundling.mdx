---
title: Optimizing package bundling
nav_title: Package Bundling
description: Learn how to analyze and optimize your application's server and client bundles with the Next.js Bundle Analyzer for Turbopack, and the `@next/bundle-analyzer` plugin for Webpack.
related:
  description: Learn more about optimizing your application for production.
  links:
    - app/guides/production-checklist
---

Bundling is the process of combining your application code and its dependencies into optimized output files for the client and server. Smaller bundles load faster, reduce JavaScript execution time, improve [Core Web Vitals](https://web.dev/articles/vitals), and lower server cold start times.

Next.js automatically optimizes bundles by code splitting, tree-shaking, and other techniques. However, there are some cases where you may need to optimize your bundles manually.

There are two tools for analyzing your application's bundles:

- [Next.js Bundle Analyzer for Turbopack (experimental)](#nextjs-bundle-analyzer-experimental)
- [`@next/bundle-analyzer` plugin for Webpack](#nextbundle-analyzer-for-webpack)

This guide will walk you through how to use each tool and how to [optimize large bundles](#optimizing-large-bundles).

## Next.js Bundle Analyzer (Experimental)

> Available in v16.1 and later. You can share feedback in the [dedicated GitHub discussion](https://github.com/vercel/next.js/discussions/86731) and view the demo at [turbopack-bundle-analyzer-demo.vercel.sh](https://turbopack-bundle-analyzer-demo.vercel.sh/).

The Next.js Bundle Analyzer is integrated with Turbopack's module graph. You can inspect server and client modules with precise import tracing, making it easier to find large dependencies. Open the interactive Bundle Analyzer demo to explore the module graph.

### Step 1: Run the Turbopack Bundle Analyzer

To get started, run the following command and open up the interactive view in your browser.

```bash filename="Terminal"
npx next experimental-analyze
```

### Step 2: Filter and inspect modules

Within the UI, you can filter by route, environment (client or server), and type (JavaScript, CSS, JSON), or search by file:

<Video
  caption="Next.js bundle analyzer UI walkthrough"
  src="/videos/bundle-analyzer.mp4"
  width={1708}
  height={1080}
/>

### Step 3: Trace modules with import chains

The treemap shows each module as a rectangle. Where the size of the module is represented by the area of the rectangle.

Click a module to see its size, inspect its full import chain and see exactly where it’s used in your application:

<Image
  caption="Next.js Bundle Analyzer import chain view"
  srcLight="/docs/light/bundle-analyzer.png"
  srcDark="/docs/dark/bundle-analyzer.png"
  width={1600}
  height={874}
/>

### Step 4: Write output to disk for sharing or diffing

If you want to share the analysis with teammates or compare bundle sizes before/after optimizations, you can skip the interactive view and save the analysis as a static file with the `--output` flag:

```bash filename="Terminal"
npx next experimental-analyze --output
```

This command writes the output to `.next/diagnostics/analyze`. You can copy this directory elsewhere to compare results:

```bash filename="Terminal"
cp -r .next/diagnostics/analyze ./analyze-before-refactor
```

> More options are available for the Bundle Analyzer, see Next.js CLI reference docs for the full list.

## `@next/bundle-analyzer` for Webpack

The [`@next/bundle-analyzer`](https://www.npmjs.com/package/@next/bundle-analyzer) is a plugin that helps you manage the size of your application bundles. It generates a visual report of the size of each package and their dependencies. You can use the information to remove large dependencies, split, or [lazy-load](/docs/app/guides/lazy-loading) your code.

### Step 1: Installation

Install the plugin by running the following command:

```bash
npm i @next/bundle-analyzer
# or
yarn add @next/bundle-analyzer
# or
pnpm add @next/bundle-analyzer
```

Then, add the bundle analyzer's settings to your `next.config.js`.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {}

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer(nextConfig)
```

### Step 2: Generating a report

Run the following command to analyze your bundles:

```bash
ANALYZE=true npm run build
# or
ANALYZE=true yarn build
# or
ANALYZE=true pnpm build
```

The report will open three new tabs in your browser, which you can inspect.

## Optimizing large bundles

Once you've identified a large module, the solution will depend on your use case. Below are common causes and how to fix them:

### Packages with many exports

If you're using a package that exports hundreds of modules (such as icon and utility libraries), you can optimize how those imports are resolved using the [`optimizePackageImports`](/docs/app/api-reference/config/next-config-js/optimizePackageImports) option in your `next.config.js` file. This option will only load the modules you _actually_ use, while still giving you the convenience of writing import statements with many named exports.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['icon-library'],
  },
}

module.exports = nextConfig
```

> **Good to know:** Next.js also optimizes some libraries automatically, thus they do not need to be included in the `optimizePackageImports` list. See the [full list](/docs/app/api-reference/config/next-config-js/optimizePackageImports) of supported packages.

### Heavy client workloads

A common cause of large client bundles is doing expensive rendering work in Client Components. This often happens with libraries that exist only to transform data into UI, such as syntax highlighting, chart rendering, or markdown parsing.

If that work does not require browser APIs or user interaction, it can be run in a Server Component.

In this example, a prism based highlighter runs in a Client Component. Even though the final output is just a `<code>` block, the entire highlighting library is bundled into the client JavaScript bundle:

```tsx filename="app/blog/[slug]/page.tsx"
'use client'

import Highlight from 'prism-react-renderer'
import theme from 'prism-react-renderer/themes/github'

export default function Page() {
  const code = `export function hello() {
    console.log("hi")
  }`

  return (
    <article>
      <h1>Blog Post Title</h1>

      {/* The prism package and its tokenization logic are shipped to the client */}
      <Highlight code={code} language="tsx" theme={theme}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={className} style={style}>
            <code>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </article>
  )
}
```

This increases bundle size because the client must download and execute the highlighting library, even though the result is static HTML.

Instead, move the highlighting logic to a Server Component and render the final HTML on the server. The client will only receive the rendered markup.

```tsx filename="app/blog/[slug]/page.tsx"
import { codeToHtml } from 'shiki'

export default async function Page() {
  const code = `export function hello() {
    console.log("hi")
  }`

  // The Shiki package runs on the server and is never bundled for the client.
  const highlightedHtml = await codeToHtml(code, {
    lang: 'tsx',
    theme: 'github-dark',
  })

  return (
    <article>
      <h1>Blog Post Title</h1>

      {/* Client receives plain markup */}
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </pre>
    </article>
  )
}
```

<AppOnly>

### Opting specific packages out of bundling

Packages imported inside Server Components and Route Handlers are automatically bundled by Next.js.

You can opt specific packages out of bundling using the [`serverExternalPackages`](/docs/app/api-reference/config/next-config-js/serverExternalPackages) option in your `next.config.js`.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['package-name'],
}

module.exports = nextConfig
```

</AppOnly>

<PagesOnly>

### External packages that aren't pre-bundled

By default, packages imported into your application are not bundled. This can impact performance if external packages are not pre-bundled, for example, if imported from a monorepo or `node_modules`.

To bundle specific packages, you can use the [`transpilePackages`](/docs/app/api-reference/config/next-config-js/transpilePackages) option in your `next.config.js`.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['package-name'],
}

module.exports = nextConfig
```

To automatically bundle all packages, you can use the [`bundlePagesRouterDependencies`](/docs/pages/api-reference/config/next-config-js/bundlePagesRouterDependencies) option in your `next.config.js`.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  bundlePagesRouterDependencies: true,
}

module.exports = nextConfig
```

### Opting specific packages out of bundling

If you identify packages that shouldn't be in the bundle, you can opt specific packages out of automatic bundling using the [`serverExternalPackages`](/docs/pages/api-reference/config/next-config-js/serverExternalPackages) option in your `next.config.js`:

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Automatically bundle external packages:
  bundlePagesRouterDependencies: true,
  // Opt specific packages out of bundling:
  serverExternalPackages: ['package-name'],
}

module.exports = nextConfig
```

</PagesOnly>
