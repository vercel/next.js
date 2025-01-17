// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  async rewrites() {
    return {
      fallback: [
        {
          source: "/:path*",
          destination: `https://custom-routes-proxying-endpoint.vercel.app/:path*`,
        },
      ],
    };
  },
};

module.exports = nextConfig;
