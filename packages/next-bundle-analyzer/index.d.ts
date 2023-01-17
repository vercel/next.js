import type { NextConfig } from 'next'

export type NextBundleAnalyzer =
  (options?: { enabled?: boolean; openAnalyzer?: boolean }) =>
  (config?: NextConfig) =>
    NextConfig
