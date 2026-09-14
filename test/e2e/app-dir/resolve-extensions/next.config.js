// .web.tsx intentionally placed before .tsx to verify resolveExtensions priority
const extensions = [
  '',
  '.png',
  '.web.tsx',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.json',
]

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    resolveExtensions: [...extensions],
  },
  webpack(config) {
    config.resolve.extensions = [...extensions]
    return config
  },
}

module.exports = nextConfig
