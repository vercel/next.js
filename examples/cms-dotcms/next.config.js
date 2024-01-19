/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const baseUrl = process.env.NEXT_PUBLIC_DOTCMS_HOST;
    return [
      {
        source: "/images/:slug*",
        destination: `${baseUrl}/images/:slug*`,
      },
    ];
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
