import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Chunk URLs carry a `?dpl=` suffix, which the chunk loader must still match
  // against the tags already in the DOM.
  deploymentId: 'dynamic-chunk-dedupe',
}

export default nextConfig
