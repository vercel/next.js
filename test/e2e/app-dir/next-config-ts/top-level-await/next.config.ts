import type { NextConfig } from 'next'
import { getFoo } from './get-foo'

const foo = await getFoo()

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
