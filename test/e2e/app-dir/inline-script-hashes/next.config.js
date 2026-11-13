module.exports = {
  experimental: {
    inlineScriptHashes: { algorithm: 'sha256' },
  },
  async headers() {
    return [
      {
        source: '/unsafe-inline',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'",
          },
        ],
      },
      {
        source: '/((?!unsafe-inline).*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ]
  },
}
