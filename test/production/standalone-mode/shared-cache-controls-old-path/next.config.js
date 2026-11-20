/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',
  cacheHandler: require.resolve('./cache-handler.js'),
}
