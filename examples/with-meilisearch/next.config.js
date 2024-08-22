/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "steam.meilisearch.dev",
      },
    ],
  },
};

module.exports = nextConfig;
