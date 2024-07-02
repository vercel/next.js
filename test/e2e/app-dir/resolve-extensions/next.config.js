const extensions = ['', '.png', '.tsx', '.ts', '.jsx', '.js', '.json']

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    resolveExtensions: [...extensions],
  },
}

module.exports = nextConfig
