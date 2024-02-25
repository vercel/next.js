import type { NextConfig } from 'next'
import { foo } from './foo.cts'

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
