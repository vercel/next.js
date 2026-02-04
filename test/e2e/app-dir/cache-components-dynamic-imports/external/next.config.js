/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  serverExternalPackages: ['external-esm-pkg-with-async-import'],
}

module.exports = nextConfig
