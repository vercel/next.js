/** @type {import('next').NextConfig} */
module.exports = {
  // `export const runtime = 'edge'` is not compatible with Cache Components.
  cacheComponents: false,
  experimental: {
    // CI enables this alongside Cache Components; it requires that feature.
    cachedNavigations: false,
  },
}
