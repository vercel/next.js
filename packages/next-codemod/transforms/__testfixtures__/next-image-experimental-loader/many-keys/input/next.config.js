/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  reactStrictMode: true,

  images: {
    loader: "cloudinary",
    path: "https://example.com/"
  },

  async redirects() {
    return [
      {
        source: '/source',
        destination: '/dest',
        permanent: true,
      },
    ];
  },
}
