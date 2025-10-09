import Module from 'module'
const require = Module.createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    adapterPath: require.resolve('./my-adapter.mjs'),
    cacheComponents: process.env.TEST_CACHE_COMPONENTS === '1',
  },
  output: process.env.TEST_EXPORT ? 'export' : undefined,
}

export default nextConfig
