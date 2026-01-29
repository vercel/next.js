/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*': [
        {
          // Glob pattern match for text content types
          condition: { contentType: 'text/*' },
          loaders: [require.resolve('./text-loader.js')],
          as: '*.js',
        },
        {
          // Regex match for image content types
          condition: { contentType: /^image\// },
          loaders: [require.resolve('./image-loader.js')],
          as: '*.js',
        },
      ],
    },
  },
  webpack: (config) => {
    config.module.rules.push(
      {
        mimetype: /^text\//,
        use: [{ loader: require.resolve('./text-loader.js') }],
        type: 'javascript/auto',
      },
      {
        mimetype: /^image\//,
        use: [{ loader: require.resolve('./image-loader.js') }],
        type: 'javascript/auto',
      }
    )
    return config
  },
}

module.exports = nextConfig
