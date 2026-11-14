/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    rules: {
      '*.pid': {
        loaders: [require.resolve('./pid-loader.js')],
        as: '*.js',
      },
    },
  },
}
