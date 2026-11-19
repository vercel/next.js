import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['my-wasm-pkg'],
}

export default nextConfig
