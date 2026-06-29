/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      '*': [
        {
          // Exact match for text/javascript content type
          condition: { contentType: 'text/javascript' },
          loaders: [require.resolve('./js-loader.js')],
          as: '*.js',
        },
        {
          // Glob pattern match for text content types
          // Should not be applied to text/javascript due to the order of rules
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
        mimetype: 'text/javascript',
        use: [{ loader: require.resolve('./js-loader.js') }],
        type: 'javascript/auto',
      },
      {
        mimetype: /^text\/(?!javascript$)/,
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
