import { NextConfig } from 'next'
import { after } from './after'

const nextConfig: NextConfig = {
  compiler: {
    runAfterProductionCompile: async ({ distDir, projectDir }) => {
      await after({ distDir, projectDir })
    },
  },
}

export default nextConfig
