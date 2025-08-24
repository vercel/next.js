import type { NextConfig } from 'next'

// type error
let foo: number = 'foo'

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
