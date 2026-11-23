import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  deploymentId: 'turbopack-build-worker',
  env: {
    // `next build` sets `process.env.NEXT_DEPLOYMENT_ID` from `deploymentId`
    // after loading this config, which is after the build worker has been
    // spawned. The worker loads this config again for the compilation, so this
    // only sees the value if the worker received the parent's environment.
    BUILD_WORKER_SEEN_DEPLOYMENT_ID: String(process.env.NEXT_DEPLOYMENT_ID),
  },
  experimental: {
    turbopackBuildWorker: true,
  },
}

export default nextConfig
