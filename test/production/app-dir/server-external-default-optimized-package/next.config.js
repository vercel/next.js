/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // `date-fns` is in the default `optimizePackageImports` list.
  serverExternalPackages: ['date-fns'],
}

module.exports = nextConfig
