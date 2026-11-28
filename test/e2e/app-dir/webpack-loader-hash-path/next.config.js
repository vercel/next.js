/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    rules: {
      '*.custom.js': {
        loaders: [require.resolve('./loader.js')],
        as: '*.js',
      },
    },
  },
}
