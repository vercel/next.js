module.exports = {
  output: 'export',
  cacheComponents: false,
  trailingSlash: process.env.TRAILING_SLASH === '1',
  basePath: process.env.EXPORT_BASE_PATH || '',
  experimental: { cpus: 2 },
}
