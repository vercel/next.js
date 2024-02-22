import type { NextConfig } from 'next'
import { foo } from '@/lib/foo'
import { bar } from 'externals/bar'

const nextConfig: NextConfig = {
  env: {
    foo,
    bar,
  },
}

export default nextConfig
