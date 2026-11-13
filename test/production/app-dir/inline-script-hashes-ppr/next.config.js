module.exports = {
  cacheComponents: true,
  experimental: {
    inlineScriptHashes: { algorithm: 'sha256' },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
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
