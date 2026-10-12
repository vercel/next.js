import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  webpack(config) {
    // A top-level CSS rule disables Next.js's built-in CSS handling. Nest this
    // pre-loader so it supplements the existing CSS/PostCSS pipeline instead.
    config.module.rules.push({
      rules: [
        {
          test: /\.css$/,
          enforce: 'pre',
          use: [require.resolve('./loaders/identity-css-loader.cjs')],
        },
      ],
    })
    return config
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['./loaders/identity-css-loader.cjs'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
