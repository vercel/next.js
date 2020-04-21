// require('dotenv').config()
// const path = require('path')
// const Dotenv = require('dotenv-webpack')
// const next = require('next')
// const bsConfig = require('./bsconfig.json')
// const withTM = require('next-transpile-modules')
// const withCSS = require('@zeit/next-css')
// 
// module.exports = withTM(
//   withCSS({
//     transpileModules: [...bsConfig['bs-dependencies'], 'bs-platform'],
//     pageExtensions: ['bs.js', 'js'],
//     webpack: config => {
//       // Read the .env file
//       config.plugins = [
//         new Dotenv({
//           path: path.join(__dirname, '.env'),
//           systemvars: true,
//         }),
//       ]
//       return config
//     },
//   })
// )
require('dotenv').config()
require('isomorphic-fetch')
const path = require('path')
const Dotenv = require('dotenv-webpack')

module.exports = {
  webpack: config => {
    config.plugins = config.plugins || []

    config.plugins = [
      ...config.plugins,

      // Read the .env file
      new Dotenv({
        path: path.join(__dirname, '.env'),
        systemvars: true,
      }),
    ]

    return config
  },
}
