import path from 'path'
import type { NextConfig } from 'next'

const wasmPath = path
  .relative(
    __dirname,
    require.resolve('lightningcss-wasm/lightningcss_node.wasm')
  )
  .replaceAll(path.sep, '/')

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/*': [wasmPath],
  },
}

export default nextConfig
