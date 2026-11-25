/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    rules: {
      '*.txt': {
        loaders: ['./loaders/module-state-loader.js'],
        as: '*.js',
      },
    },
  },
}
