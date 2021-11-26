module.exports = {
  async headers() {
    return [
      {
        source: '/csp',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "script-src-elem 'nonce-abc123' 'unsafe-eval'",
          },
        ],
      },
    ]
  },
}
