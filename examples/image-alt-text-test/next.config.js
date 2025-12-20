/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // No altTextGeneration config needed - it's built into the Image component
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

module.exports = nextConfig;
