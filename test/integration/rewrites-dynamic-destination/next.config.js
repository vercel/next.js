module.exports = {
  // i18n
  // basePath
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/old-path/:slug/fallback-blocking',
          destination: `/new-path/:slug/fallback-blocking`,
        },
        {
          source: '/old-path/:slug/fallback',
          destination: `/new-path/:slug/fallback`,
        },
      ],
      afterFiles: [
        {
          source: '/old-path/:slug/no-fallback',
          destination: `/new-path/:slug/no-fallback`,
        },
        {
          source: '/old-path/:slug/ssr',
          destination: `/new-path/:slug/ssr`,
        },
      ],
      fallback: [
        {
          source: '/old-path/:slug/unknown',
          destination: `/new-path/:slug/no-fallback-default`,
        },
      ],
    }
  },
}
