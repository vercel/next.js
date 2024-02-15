const extensions = ['png', 'tsx', 'ts', 'jsx', 'js', 'json']

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbo: {
    resolveExtensions: extensions,
  },
  webpack(config) {
    config.resolve.extensions = extensions.map((ext) => `.${ext}`)
    return config
  },
}

module.exports = nextConfig
