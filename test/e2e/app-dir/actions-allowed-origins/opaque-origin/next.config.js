const allowOpaqueOrigin = process.env.NEXT_TEST_ALLOW_OPAQUE_ORIGIN === '1'

/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {},
  },
  headers() {
    return [
      {
        source: '/sandboxed',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: 'sandbox allow-forms',
          },
        ],
      },
    ]
  },
  experimental: {
    serverActions: {
      allowedOrigins: allowOpaqueOrigin ? ['null'] : [],
    },
  },
}
