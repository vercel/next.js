/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    webSocketRouteHandlers: {
      allowedOrigins: ['https://client.example'],
    },
  },
  async headers() {
    return [
      {
        source: '/ws',
        headers: [
          { key: 'Connection', value: 'x-routing-secret' },
          { key: 'Content-Length', value: '999999' },
          { key: 'Set-Cookie', value: 'routing-secret=present; Path=/' },
          { key: 'x-routing-secret', value: 'routing-secret' },
          { key: 'x-response-layer', value: 'routing' },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      { source: '/socket', destination: '/ws' },
      {
        source: '/external-socket',
        destination: 'http://127.0.0.1:9/socket',
      },
    ]
  },
  async redirects() {
    return [{ source: '/old-socket', destination: '/ws', permanent: false }]
  },
}
