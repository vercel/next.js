/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  trailingSlash: true,
  rewrites: async () => {
    const isCacheComponentsEnabled =
      process.env.__NEXT_CACHE_COMPONENTS === 'true'

    return [
      {
        source: '/:lang(en|es)/',
        destination: isCacheComponentsEnabled
          ? '/:lang/cache-components/'
          : '/:lang/legacy/',
      },
    ]
  },
}
