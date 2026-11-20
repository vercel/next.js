/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  turbopack: {
    rules: {
      // The same shape as the rule `create-next-app` generates for Tailwind CSS.
      // The glob also matches `*.module.css`, which must stay CSS Modules.
      '*.css': {
        loaders: [require.resolve('./passthrough-loader.js')],
        as: '*.css',
      },
    },
  },
}

module.exports = nextConfig
