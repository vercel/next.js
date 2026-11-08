/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Records the outputs that a deployment adapter builds functions from.
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
