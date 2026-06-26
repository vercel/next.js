const { BLOG_URL } = process.env;

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/blog",
        destination: `${BLOG_URL}/blog`,
      },
      {
        source: "/blog/:path+",
        destination: `${BLOG_URL}/blog/:path+`,
      },
      {
        source: "/blog-static/_next/:path+",
        destination: `${BLOG_URL}/blog-static/_next/:path+`,
      },
    ];
  },
};

module.exports = nextConfig;
