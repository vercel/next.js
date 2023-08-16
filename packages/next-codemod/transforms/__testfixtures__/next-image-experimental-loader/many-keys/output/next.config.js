/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  reactStrictMode: true,

  images: {
    loader: "custom",
    loaderFile: "./cloudinary-loader.js"
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
