/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // Enabling PPR to force using the react experimental channel, which
    // implements React owner stacks.
    ppr: true,
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },
  webpack(config) {
    config.module.rules.push({ test: /\.svg$/, use: '@svgr/webpack' })

    return config
  },
}

module.exports = nextConfig
