// Large static / ISR site fixture for measuring build-time prerendering
// (the static generation phase of `next build`).
//
// Every page comes from `generateStaticParams` and sets `revalidate`, so
// each one produces an HTML file, an RSC payload and a `.meta` file. All
// content is derived from the route params with a seeded PRNG: no network,
// no clock, no randomness.
//
// Knobs (environment variables):
//   BENCH_PAGES    total number of prerendered dynamic pages (default 8000:
//                  50% product pages, 25% articles, 15% docs, 10% category
//                  listings). Read by `generateStaticParams`, i.e. while
//                  collecting page data, so it can change between two
//                  `--experimental-build-mode generate` runs of one compile.
//   BENCH_WORKERS  static generation worker count (default 4). Pinned so
//                  runs are comparable across machines with different core
//                  counts; the Next.js default is `availableParallelism - 1`.
//
// At the defaults one generate pass prerenders 8004 routes (about 56,000
// files, 1.5 GB) and takes roughly 32 seconds on an 8 vCPU x86 cloud VM.
//
// Usage, from this directory (there is no package.json on purpose: `next`,
// `react` and `react-dom` resolve from the workspace root, and the lockfile
// stays untouched):
//   node ../../packages/next/dist/bin/next build --experimental-build-mode compile
//   node ../../packages/next/dist/bin/next build --experimental-build-mode generate
module.exports = {
  // A fixed build id keeps prerendered output comparable between builds.
  generateBuildId: async () => 'bench-static-isr-site',
  // Deployed apps carry a deployment marker on every asset URL, which shows
  // up in each page's HTML and Flight payload. Set one so payload sizes
  // match production.
  deploymentId: 'dpl_BenchStaticIsr0123456789abcdef',
  experimental: {
    cpus: Number(process.env.BENCH_WORKERS) || 4,
  },
}
