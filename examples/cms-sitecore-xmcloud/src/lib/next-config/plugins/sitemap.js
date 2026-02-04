/**
 * @param {import('next').NextConfig} nextConfig
 */
const sitemapPlugin = (nextConfig = {}) => {
  return Object.assign({}, nextConfig, {
    async rewrites() {
      return [
        ...(await nextConfig.rewrites()),
        // sitemap route
        {
          source: "/sitemap:id([\\w-]{0,}).xml",
          destination: "/api/sitemap",
        },
      ];
    },
  });
};

module.exports = sitemapPlugin;
