import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Chunk URLs carry a `?dpl=` suffix, which the chunk loader must still match
  // against the tags already in the DOM. Deployments set their own
  // `NEXT_DEPLOYMENT_ID`, which the config must not contradict.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || 'dynamic-chunk-dedupe',
}

export default nextConfig
