/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      { hostname: "cdn.sanity.io" },
      { hostname: "source.unsplash.com" },
    ],
  },
};
