import type { NextConfig } from 'next'
import { foo } from 'esm/foo'
import { bar } from 'cjs/bar'

const nextConfig: NextConfig = {
  env: {
    foo,
    bar,
  },
}

export default nextConfig
