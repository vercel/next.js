/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.stream.prepr.io' },
      { protocol: 'https', hostname: '*.b-cdn.net' },
    ],
  },
}
