/** @type {import('next').NextConfig} */
const nextConfig = {
  adapterPath: require.resolve('./my-adapter.mjs'),
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
}

module.exports = nextConfig
