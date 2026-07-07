/** @type {import('next').NextConfig} */
module.exports = {
  adapterPath: require.resolve('./my-adapter.mjs'),
  agentRules: false,
  experimental: {
    webSocketRouteHandlers: true,
  },
  async rewrites() {
    return [{ source: '/socket', destination: '/ws' }]
  },
}
