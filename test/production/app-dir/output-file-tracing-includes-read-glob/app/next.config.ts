import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/*': [
      '../node_modules/.pnpm/lightningcss-wasm@1.28.2_patch_hash=d2d6e72f68b8ae36c669d00a13784346180c35c614b37a4412d651117c518ecf/node_modules/lightningcss-wasm/lightningcss_node.wasm',
    ],
  },
}

export default nextConfig
