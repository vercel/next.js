import type { NextConfig } from 'next'

type NextBundleAnalyzer = (options?: {
  enabled?: boolean
  openAnalyzer?: boolean
}) => (config?: NextConfig) => NextConfig

export = NextBundleAnalyzer
