import type { NextConfig } from 'next'
import { foo } from '@/lib/foo'
import { bar } from 'externals/bar'
// why baz? to ensure that it imports relative to the root, not from the distDir/next.compiled.config.js
import { baz } from './baz'

const nextConfig: NextConfig = {
  env: {
    foo,
    bar,
    baz,
  },
}

export default nextConfig
