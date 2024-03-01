import type { NextConfig } from 'next'
import { foo } from './lib/foo.cts'
import { bar } from './lib/bar.cjs'
import { baz } from './lib/baz'

const nextConfig: NextConfig = {
  env: {
    foo,
    bar,
    baz,
  },
}

export default nextConfig
