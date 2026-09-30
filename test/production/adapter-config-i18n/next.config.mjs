import Module from 'module'

const require = Module.createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { cpus: 2, adapterPath: require.resolve('./my-adapter.mjs') },
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
}

export default nextConfig
