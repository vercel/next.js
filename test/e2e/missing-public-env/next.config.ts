import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_MISSING_ENV_CONFIG: 'config-value' },
  compiler: {
    defineServer: {
      'process.env.NEXT_PUBLIC_MISSING_ENV_SERVER_COMPILER':
        'server-compiler-value',
    },
    define: {
      'process.env.NEXT_PUBLIC_MISSING_ENV_COMPILER': 'compiler-value',
    },
  },
}

export default nextConfig
