import Module from 'module'
const require = Module.createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    adapterPath: require.resolve('./my-adapter.mjs'),
    cacheComponents: process.env.TEST_CACHE_COMPONENTS === '1',
  },
  rewrites() {
    return [
      {
        source: '/rewrite-me',
        destination: '/isr-pages',
      },
    ]
  },
  redirects() {
    return [
      {
        source: '/redirect-me',
        destination: '/isr-pages',
        permanent: false,
      },
    ]
  },
  headers() {
    return [
      {
        source: '/isr-pages',
        headers: [{ key: 'x-custom-header', value: 'hello' }],
      },
    ]
  },
  output: process.env.TEST_EXPORT ? 'export' : undefined,
}

export default nextConfig
