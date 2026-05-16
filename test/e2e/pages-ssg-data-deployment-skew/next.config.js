/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: process.env.DIST_DIR && '.next.' + process.env.DIST_DIR,
}

module.exports = nextConfig
