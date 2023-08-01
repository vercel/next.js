import { nextConfigHeaders } from './cookies.mjs'

const headers = nextConfigHeaders.map((header) => ({
  key: 'Set-Cookie',
  value: header,
}))

/**
 * @type {import('next').NextConfig}
 */
const config = {
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
