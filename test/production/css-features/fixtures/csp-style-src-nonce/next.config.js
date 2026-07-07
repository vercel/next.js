module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `style-src 'self' 'nonce-VmVyY2Vs';`,
          },
        ],
      },
    ]
  },
}
