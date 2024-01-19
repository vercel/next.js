/** @type {import('next').NextConfig} */

const withNextra = require("nextra")({
  theme: "section-blog-theme",
  themeConfig: "./theme.config.jsx",
  readingTime: true,
});

module.exports = withNextra({
  reactStrictMode: true,
  // pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],
  images: {
    remotePatterns: [
      {
        hostname: "img.shields.io",
      },
    ],
  },
});
