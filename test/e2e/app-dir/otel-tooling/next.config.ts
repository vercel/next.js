import type { NextConfig } from 'next'
import { installProvider } from './instrumentation-node'

const nextConfig: NextConfig = {
  distDir: 'otel-output',
  experimental: { otelInBuild: true },
}

export default function config(phase: string) {
  console.log(
    `[tooling-otel]${JSON.stringify({ kind: 'config', pid: process.pid, phase })}`
  )
  if (
    phase === 'phase-production-build' &&
    process.env.TOOLING_PRE_REGISTER === '1'
  ) {
    installProvider()
  }
  return nextConfig
}
