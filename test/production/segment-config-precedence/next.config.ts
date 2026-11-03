import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Prefer JSX for the duplicate-layout fixture while keeping the TS/JS routes.
  pageExtensions: ['jsx', 'js', 'tsx', 'ts'],
}

export default nextConfig
