/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  webpack(c) {
    c.output.pathinfo = true
    c.optimization.minimize = false
    return c
  },
}

module.exports = nextConfig
