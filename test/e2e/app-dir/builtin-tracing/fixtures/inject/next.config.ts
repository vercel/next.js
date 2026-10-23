import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  injectInstrumentation: ['./.vercel/otel/instrumentation.js'],
}

export default nextConfig
