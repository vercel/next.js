import type { NextConfig } from 'next'

declare const NextBundleAnalyzer =
  (options?: { enabled?: boolean; openAnalyzer?: boolean }) =>
  (config?: NextConfig) =>
    NextConfig

export = NextBundleAnalyzer
