/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  compiler: {
    removeConsole: { exclude: ['error'] },
  },
}

module.exports = nextConfig
