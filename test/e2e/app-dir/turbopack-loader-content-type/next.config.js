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
}

module.exports = nextConfig
