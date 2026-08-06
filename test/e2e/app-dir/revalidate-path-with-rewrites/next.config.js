/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  rewrites: async () => {
    const isCacheComponentsEnabled =
      process.env.__NEXT_CACHE_COMPONENTS === 'true'

    return [
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
    ]
  },
}
