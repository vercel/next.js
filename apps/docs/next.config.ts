import type { NextConfig } from 'next'
import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

const config: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // Redirect old isolatedDevBuild config page to CLI reference
      {
        source:
          '/docs/app/api-reference/config/next-config-js/isolatedDevBuild',
        destination: '/docs/app/api-reference/cli/next#next-dev-options',
        permanent: true,
      },
      {
        source:
          '/docs/pages/api-reference/config/next-config-js/isolatedDevBuild',
        destination: '/docs/app/api-reference/cli/next#next-dev-options',
        permanent: true,
      },
    ]
  },
}

export default withMDX(config)
