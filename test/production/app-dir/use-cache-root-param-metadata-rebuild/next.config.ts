import type { NextConfig } from 'next'

export default function nextConfig(
  _phase: string,
  { defaultConfig }: { defaultConfig: NextConfig }
): NextConfig {
  // Spreading defaults must keep static root param tracking enabled.
  return {
    ...defaultConfig,
    cacheComponents: true,
    experimental: {
      ...defaultConfig.experimental,
    },
  }
}
