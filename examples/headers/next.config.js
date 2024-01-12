// @ts-check

/**
 * @type {import('next').NextConfig}
 **/
const nextConfig = {
  async headers() {
    return [
      {
        source: "/about",
        headers: [
          {
            key: "X-About-Custom-Header",
            value: "about_header_value",
          },
        ],
      },
      {
        source: "/news/:id",
        headers: [
          {
            key: "X-News-Custom-Header",
            value: "news_header_value",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
