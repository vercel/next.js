import type { NextConfig } from 'next'

declare function NextBundleAnalyzer(options?: {
  enabled?: boolean
  openAnalyzer?: boolean
  analyzerMode?: 'json' | 'static'
}): (config?: NextConfig) => NextConfig

export = NextBundleAnalyzer
