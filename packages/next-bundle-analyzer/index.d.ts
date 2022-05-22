import type { NextConfig } from 'next'

const NextBundleAnalyzer =
  (options?: { enabled?: boolean }) => (config?: NextConfig) =>
    NextConfig

export = NextBundleAnalyzer
