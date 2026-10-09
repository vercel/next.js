import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Isolate the DTS generator's lenient error handling from Next's own type checker.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    turbopackModuleFederation: {
      name: 'lenientProducer',
      exposes: { './Widget': './lib/Widget.tsx' },
      dts: { generateTypes: { abortOnError: false } },
    },
  },
}

export default nextConfig
