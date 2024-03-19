/**
 * @param {import('next').NextConfig} nextConfig
 */
const robotsPlugin = (nextConfig = {}) => {
  return Object.assign({}, nextConfig, {
    async rewrites() {
      return [
        ...(await nextConfig.rewrites()),
        // robots route
        {
          source: "/robots.txt",
          destination: "/api/robots",
        },
      ];
    },
  });
};

module.exports = robotsPlugin;
