/* eslint-disable */
const withLess = require('@zeit/next-less')

module.exports = withLess({
  lessLoaderOptions: {
    javascriptEnabled: true,
  },
})
