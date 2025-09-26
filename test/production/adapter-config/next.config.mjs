import Module from 'module'
const require = Module.createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    adapterPath: require.resolve('./my-adapter.mjs'),
    ppr: Boolean(process.env.TEST_PPR),
  },
}

export default nextConfig
