import type { NextConfig } from 'next'
import { foo } from './foo.mts'
import { bar } from './bar.mjs'
import { baz } from './baz.js'

const nextConfig: NextConfig = {
  env: {
    foo,
    bar,
    baz,
  },
}

export default nextConfig
