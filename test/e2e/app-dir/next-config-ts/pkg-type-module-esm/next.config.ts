import type { NextConfig } from 'next'
import { foo } from './foo.cts'
import { bar } from './bar.cjs'
import { baz } from './baz.js'

const nextConfig: NextConfig = {
  env: {
    foo,
    bar,
    baz,
  },
}

export default nextConfig
