import Module from 'module'
const require = Module.createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  adapterPath: require.resolve('./adapter.mjs'),
  cacheComponents: true,
}

export default nextConfig
