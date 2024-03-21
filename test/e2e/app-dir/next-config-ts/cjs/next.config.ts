import type { NextConfig } from 'next'
import { foo } from './lib/foo.mts'
import { bar } from './lib/bar.mjs'
import { baz } from './lib/baz.js'

const nextConfig: NextConfig = {
  env: {
    foo,
    bar,
    baz,
  },
}

export default nextConfig
