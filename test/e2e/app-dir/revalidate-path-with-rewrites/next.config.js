const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  rewrites: async () => [
    {
      source: '/static',
      destination: isCacheComponentsEnabled
        ? '/cache-components/static'
        : '/legacy/static',
    },
    {
      source: '/dynamic',
      destination: isCacheComponentsEnabled
        ? '/cache-components/dynamic'
        : '/legacy/dynamic',
    },
  ],
}
