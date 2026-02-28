/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  serverExternalPackages: ['hmr-external', './lib/hmr-file-external'],
}

module.exports = nextConfig
