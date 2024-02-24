/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/home/memory-cache",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
