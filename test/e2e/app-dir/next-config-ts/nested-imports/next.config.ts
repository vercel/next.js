import type { NextConfig } from 'next'
import { foobar } from './foo'

const nextConfig: NextConfig = {
  env: {
    foobar,
  },
}

export default nextConfig
