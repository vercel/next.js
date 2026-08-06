/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {}

if (!process.env.NEXT_ADAPTER_PATH) {
  nextConfig.adapterPath = require.resolve('./my-adapter.mjs')
}

module.exports = nextConfig
