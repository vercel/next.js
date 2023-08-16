/**@type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        hostname: 'image-optimization-test.vercel.app',
        pathname: '/test.jpg',
      },
    ],
  },
}

module.exports = config
