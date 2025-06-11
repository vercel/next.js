import type { NextConfig } from 'next'

const config: NextConfig = {
  async redirects() {
    return [
      {
        source: '/next-config-redirect',
        destination: '/about',
        permanent: false,
      },
    ]
  },
}

export default config
