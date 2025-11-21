import type { NextConfig } from 'next'
import { foobarbaz } from './foo'

const nextConfig: NextConfig = {
  env: {
    foobarbaz,
  },
}

export default nextConfig
