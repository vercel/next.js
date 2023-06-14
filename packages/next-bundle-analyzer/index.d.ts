import type { NextConfig } from 'next'

type NextBundleAnalyzer = (options?: {
  enabled?: boolean
  openAnalyzer?: boolean
  analyzerMode?: 'json' | 'static'
}) => (config?: NextConfig) => NextConfig

export = NextBundleAnalyzer
