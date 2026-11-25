module.exports = {
  cacheComponents: false,
  trailingSlash: process.env.TRAILING_SLASH === '1',
  skipTrailingSlashRedirect: process.env.SKIP_TRAILING_SLASH_REDIRECT === '1',
  output: process.env.STANDALONE === '1' ? 'standalone' : undefined,
  cacheHandler:
    process.env.CACHE_STORAGE === 'custom'
      ? require.resolve('./cache-handler.js')
      : undefined,
  cacheMaxMemorySize: process.env.CACHE_STORAGE === 'disk' ? 0 : undefined,
  i18n: { locales: ['en', 'fr'], defaultLocale: 'en' },
  experimental: { cpus: 2, cachedNavigations: false },
  async rewrites() {
    return [{ source: '/rewritten/:id', destination: '/pages-victim/:id' }]
  },
}
