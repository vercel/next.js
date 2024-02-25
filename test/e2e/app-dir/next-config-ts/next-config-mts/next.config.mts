import type { NextConfig } from 'next'
import { foo } from './foo.mts'

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
