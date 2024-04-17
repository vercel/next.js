/** @type {import('next').NextConfig} */
module.exports = {
  async rewrites() {
    return [
      {
        source: "/blog",
        destination: "/news",
      },
    ];
  },
};
