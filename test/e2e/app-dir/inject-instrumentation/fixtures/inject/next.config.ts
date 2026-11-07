import path from 'path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  instrumentationInject: [
    './injected/instrumentation.js',
    // Config wrappers often pass absolute paths.
    path.join(__dirname, 'injected', 'second.js'),
  ],
}

export default nextConfig
