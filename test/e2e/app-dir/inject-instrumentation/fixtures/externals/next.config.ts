import path from 'path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['external-instrumentation'],
  injectInstrumentation: [
    'external-instrumentation/init',
    'bundled-instrumentation/init',
    './injected/instrumentation.js',
    path.join(__dirname, 'injected', 'second.js'),
  ],
}

export default nextConfig
