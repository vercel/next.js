import Module from 'module'
const require = Module.createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: process.env.TEST_CACHE_COMPONENTS === '1',
  experimental: { adapterPath: require.resolve('./my-adapter.mjs') },
  output: process.env.TEST_EXPORT ? 'export' : undefined,
}

export default nextConfig
