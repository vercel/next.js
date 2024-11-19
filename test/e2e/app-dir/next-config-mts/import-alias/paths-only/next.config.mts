import type { NextConfig } from 'next'
import { foo } from '@/foo'

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
