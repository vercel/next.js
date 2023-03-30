import { nextConfigHeaders } from './cookies.mjs'

const headers = nextConfigHeaders.map((header) => ({
  key: 'Set-Cookie',
  value: header,
}))

console.log('debug:next.config.mjs:headers', headers)

/**
 * @type {import('next').NextConfig}
 */
const config = {
  experimental: { appDir: true },
  async headers() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'query',
            key: 'next-config-headers',
            value: 'true',
          },
        ],
        headers,
      },
    ]
  },
}

export default config
