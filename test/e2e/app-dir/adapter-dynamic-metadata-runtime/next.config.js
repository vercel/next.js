/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {}

if (!process.env.NEXT_ADAPTER_PATH && process.env.NEXT_ENABLE_ADAPTER !== '0') {
  nextConfig.adapterPath = require.resolve('./my-adapter.mjs')
}

module.exports = nextConfig
