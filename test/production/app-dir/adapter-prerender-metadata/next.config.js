/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  htmlLimitedBots: /MyHTMLLimitedBot/i,
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
