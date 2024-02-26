import type { NextConfig } from 'next'

declare function NextBundleAnalyzer(options?: {
  enabled?: boolean
  openAnalyzer?: boolean
  analyzerMode?: 'json' | 'static'

  /**
   * Log level. Can be 'info', 'warn', 'error' or 'silent'.
   * @default 'info'
   */
  logLevel?: 'info' | 'warn' | 'error' | 'silent' | undefined
}): (config?: NextConfig) => NextConfig

export = NextBundleAnalyzer
