module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-to-gsp-not-required',
        destination: '/gsp',
      },
      {
        source: '/rewrite-to-gsp',
        destination: '/gsp?foo=bar',
      },
      {
        source: '/rewrite-to-gsp-unsafe',
        destination: '/gsp?foo=bar',
        missing: [
          {
            type: 'query',
            key: 'skip',
          },
        ],
      },
      // 1. The public request starts at `/rewrite-to-blocking-gsp/:slug`.
      // 2. The rewrite resolves to the shared blocking `getStaticProps` page
      //    `/blocking-gsp/:slug` and adds `foo=bar`.
      // 3. Tests then verify that this shared HTML still omits request-local
      //    `rewriteReconciliation` from `__NEXT_DATA__`.
      {
        source: '/rewrite-to-blocking-gsp/:slug',
        destination: '/blocking-gsp/:slug?foo=bar',
      },
    ]
  },
}
