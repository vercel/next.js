import type { NextConfig } from 'next'

const NextBundleAnalyzer =
  (options?: { enabled?: boolean; openAnalyzer?: boolean }) =>
  (config?: NextConfig) =>
    NextConfig

export = NextBundleAnalyzer
