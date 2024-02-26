import type { NextConfig } from 'next'
import { foo } from 'foo'
import { bar } from 'esm/bar'

const nextConfig: NextConfig = {
  env: {
    foo,
    bar,
  },
}

export default nextConfig
