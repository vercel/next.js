import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackModuleFederation: {
      name: 'typedProducer',
      exposes: {
        './Widget': './lib/Widget.tsx',
        './answer': './lib/answer.ts',
      },
      dts: {
        generateTypes: {
          tsConfigPath: './tsconfig.json',
          abortOnError: true,
        },
      },
    },
  },
}

export default nextConfig
