/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  htmlLimitedBots: /MyBot/i,
}

module.exports = nextConfig
