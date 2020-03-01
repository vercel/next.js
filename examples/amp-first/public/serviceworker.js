/* global importScripts, AMP_SW */
importScripts('https://cdn.ampproject.org/sw/amp-sw.js')

/*
  This configures the AMP service worker to enhance network resiliency and
  optimizes asset caching. This configuration will:

  - Cache AMP scripts with a stale-while-revalidate strategy for a longer duration
    than the default http response headers indicate.
  - Cache valid visited AMP documents, and serve only in case of flaky network conditions.
  - Cache and serve an offline page.
  - Serve static assets with a cache first strategy.

  Checkout https://github.com/ampproject/amp-sw/ to learn more about how to configure
  asset caching and link prefetching.
*/
AMP_SW.init({
  assetCachingOptions: [
    {
      regexp: /\.(png|jpg|woff2|woff|css|js)/,
      cachingStrategy: 'CACHE_FIRST', // options are NETWORK_FIRST | CACHE_FIRST | STALE_WHILE_REVALIDATE
    },
  ],
  offlinePageOptions: {
    url: '/offline',
    assets: [],
  },
})
