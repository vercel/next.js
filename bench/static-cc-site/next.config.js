// Large static site fixture for measuring build-time prerendering (the
// static generation phase of `next build`) under `cacheComponents: true`.
//
// Sibling of `bench/static-isr-site`: the same site, content generators,
// shared components and client components (imported from that directory),
// built with Cache Components instead of `revalidate` exports. Data comes
// from `use cache` functions (`lib/cms.js`); 60% of the pages are partially
// prerendered (a static shell plus dynamic holes), 40% are fully static.
//
//   template                         share  kind
//   /products/[id]                    50%   partial: `cookies()` and a
//                                           short-lived cache inside Suspense
//   /category/[category]/[page]       10%   partial: `searchParams` inside
//                                           Suspense
//   /blog/[slug]                      25%   fully static, data-level cache
//   /docs/[...path]                   15%   fully static, component-level
//                                           cache and a cached layout
//
// All content is derived from the route params with a seeded PRNG: no
// network, no clock, no randomness.
//
// Knobs (environment variables):
//   BENCH_PAGES     total number of prerendered dynamic pages (default 8000).
//                   Read by `generateStaticParams`, so it can change between
//                   two `--experimental-build-mode generate` runs of one
//                   compile.
//   BENCH_WORKERS   static generation worker count (default 4).
//   BENCH_CC_HOLES  set to 0 to leave out the dynamic holes, which makes
//                   every page fully static (calibration). Read at render
//                   time.
//
// Usage, from this directory (there is no package.json on purpose: `next`,
// `react` and `react-dom` resolve from the workspace root):
//   node ../../packages/next/dist/bin/next build --experimental-build-mode compile
//   node ../../packages/next/dist/bin/next build --experimental-build-mode generate
//
// `use cache` function ids are derived from the server actions encryption
// key, which is random per compile. Set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
// to compare the output of two compiles.
module.exports = {
  cacheComponents: true,
  partialPrefetching: true,
  // A fixed build id keeps prerendered output comparable between builds.
  generateBuildId: async () => 'bench-static-cc-site',
  // Deployed apps carry a deployment marker on every asset URL, which shows
  // up in each page's HTML and Flight payload, and is part of every
  // `use cache` key.
  deploymentId: 'dpl_BenchStaticCc0123456789abcdefg',
  cacheLife: {
    // Product data: fresh for an hour, kept for a day.
    catalog: { stale: 300, revalidate: 3600, expire: 86400 },
  },
  experimental: {
    cpus: Number(process.env.BENCH_WORKERS) || 4,
  },
}
