/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.akamai.steamstatic.com",
      },
    ],
  },
};

module.exports = nextConfig;
