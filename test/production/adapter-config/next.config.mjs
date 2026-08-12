import Module from 'module'
const require = Module.createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  adapterPath: require.resolve('./my-adapter.mjs'),
  cacheComponents: process.env.TEST_CACHE_COMPONENTS === '1',
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
  supportsImmutableAssets: Boolean(process.env.IS_TURBOPACK_TEST),
  experimental: process.env.IS_TURBOPACK_TEST
    ? {
        turbopackModuleFederation: process.env.TEST_MF_HOST_ONLY
          ? {
              name: 'adapterConfig',
              remotes: {
                remoteApp: 'http://localhost:3001',
              },
            }
          : {
              name: 'adapterConfig',
              exposes: {
                './value': './components/module-federation-value',
              },
            },
      }
    : undefined,
}

export default nextConfig
