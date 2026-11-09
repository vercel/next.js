// Large static / ISR site fixture for measuring build-time prerendering (the
// static generation phase of `next build`) on a site shaped like a real one.
//
// Sibling of `bench/static-isr-site` and `bench/static-cc-site`, which have a
// handful of routes with thousands of pages each and no I/O. This one adds
// what those leave out:
//
//   data      every page reads its content with `fetch` from a local HTTP
//             server (`data-server.mjs`), through the data cache
//             (`next: { revalidate, tags }`): the same URL from the layout,
//             the page and `generateMetadata`, and dependent requests
//   shape     a `[locale]` root segment with 10 locales, hundreds of
//             generated routes with 10 pages each (`generate-routes.mjs`),
//             five nested layouts with a parallel route, `loading` and
//             `not-found` at every level, route groups, and
//             `generateStaticParams` at four levels
//   content   a navigation of 300 links in the root layout, long text pages
//             (100 to 500 KB of HTML), `next/image`, client components with
//             large props, `sitemap`, `robots`, `manifest` and
//             `opengraph-image` routes
//
// All content is derived from the request path with a seeded PRNG
// (`lib/content.mjs`): no clock, no randomness, and no network other than
// the local data server.
//
// Knobs (environment variables). "generate" knobs are read while collecting
// page data or rendering, so they can change between two
// `--experimental-build-mode generate` runs of one compile.
//
//   BENCH_CC=1             compile: build with `cacheComponents: true`. The
//                          data layer is then `lib/data.cc.js` (`use cache`
//                          functions with `cacheTag` and `cacheLife` around
//                          the same requests) and product and listing pages
//                          get dynamic holes. Default: `lib/data.isr.js`.
//   BENCH_ROUTES           `generate-routes.mjs`: number of generated routes
//                          (default 400). Run it before compiling.
//   BENCH_DATA_URL         generate: base URL of the data server, for
//                          example http://127.0.0.1:4010. Not set: content
//                          is generated in process (no `fetch`, no data
//                          cache).
//   BENCH_PAGES            generate: number of product, article and docs
//                          pages together (default 4000).
//   BENCH_MIX              generate: their shares in percent (default
//                          50,20,30).
//   BENCH_PAGES_PER_ROUTE  generate: pages per generated route (default 10,
//                          at least one per locale). With the defaults the
//                          generated routes add 4000 pages, for 8000 pages
//                          in total plus listings and index pages.
//   BENCH_LOCALES          generate: number of locales, 1 to 10 (default 10).
//   BENCH_NAV_LINKS        generate: links in the navigation (default 300).
//   BENCH_ARTICLE_KB, BENCH_DOC_KB, BENCH_SECTION_KB
//                          generate: size of the text of an article
//                          (default 60: 18 to 180 KB, which makes 100 to
//                          500 KB of HTML), a docs page (20) and a
//                          generated-route page (8).
//   BENCH_WORKERS          static generation worker count. Not set: the
//                          Next.js default.
//   BENCH_STANDALONE=1, BENCH_TRAILING_SLASH=1, BENCH_BASE_PATH=/shop,
//   BENCH_CACHE_HANDLER=1  compile and generate: `output: 'standalone'`,
//                          `trailingSlash`, `basePath`, and a custom
//                          `cacheHandler` (`cache-handler.js`).
//
// The content knobs must have the same values for the data server and the
// build.
//
// Usage, from this directory (there is no package.json on purpose: `next`,
// `react` and `react-dom` resolve from the workspace root):
//   node generate-routes.mjs
//   node data-server.mjs &
//   export BENCH_DATA_URL=http://127.0.0.1:4010
//   node ../../packages/next/dist/bin/next build --experimental-build-mode compile
//   node ../../packages/next/dist/bin/next build --experimental-build-mode generate
//
// `use cache` function ids are derived from the server actions encryption
// key, which is random per compile. Set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
// to compare the output of two compiles with BENCH_CC=1.
const path = require('path')

const cc = process.env.BENCH_CC === '1'
const dataLayer = cc ? './lib/data.cc.js' : './lib/data.isr.js'
const workers = Number(process.env.BENCH_WORKERS)

module.exports = {
  ...(cc
    ? {
        cacheComponents: true,
        partialPrefetching: true,
        cacheLife: {
          // Product data: fresh for an hour, kept for a day.
          catalog: { stale: 300, revalidate: 3600, expire: 86400 },
        },
      }
    : {}),
  // A fixed build id keeps prerendered output comparable between builds.
  generateBuildId: async () => 'bench-static-realistic-site',
  // Deployed apps carry a deployment marker on every asset URL, which shows
  // up in each page's HTML and Flight payload.
  deploymentId: 'dpl_BenchStaticRealistic0123456789a',
  // Inlined at compile time: without it the pages leave the dynamic holes
  // out.
  env: { BENCH_CC: cc ? '1' : '' },
  ...(process.env.BENCH_STANDALONE === '1' ? { output: 'standalone' } : {}),
  ...(process.env.BENCH_TRAILING_SLASH === '1' ? { trailingSlash: true } : {}),
  ...(process.env.BENCH_BASE_PATH
    ? { basePath: process.env.BENCH_BASE_PATH }
    : {}),
  ...(process.env.BENCH_CACHE_HANDLER === '1'
    ? {
        cacheHandler: path.join(__dirname, 'cache-handler.js'),
        cacheMaxMemorySize: 0,
      }
    : {}),
  // One data layer per configuration, behind one import.
  turbopack: { resolveAlias: { '@bench/data': dataLayer } },
  webpack(config) {
    config.resolve.alias['@bench/data'] = path.join(__dirname, dataLayer)
    return config
  },
  experimental: {
    // `app/global-not-found.js`: the 404 document of an app whose root
    // layout sits below a dynamic segment.
    globalNotFound: true,
    ...(workers > 0 ? { cpus: workers } : {}),
  },
}
