/** @type {import('next').NextConfig} */
module.exports = {
  adapterPath: require.resolve('./adapter.mjs'),
  experimental: {
    webSocketRouteHandlers: true,
  },
}
