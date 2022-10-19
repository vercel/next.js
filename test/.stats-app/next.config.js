// module.exports = {
//   experimental: {
//     appDir: true
//   }
// }
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})
module.exports = withBundleAnalyzer({
  experimental: {
    appDir: true,
  },
})
