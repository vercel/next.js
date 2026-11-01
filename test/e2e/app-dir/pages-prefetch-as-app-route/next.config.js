/**
 * @type import('next').NextConfig
 */
module.exports = {
  async rewrites() {
    return [
      {
        source: '/pretty',
        destination: '/modal',
      },
    ]
  },
}
