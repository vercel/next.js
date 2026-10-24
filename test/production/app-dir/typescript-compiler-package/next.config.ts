import type { NextConfig } from 'next'

export default {
  typescript: {
    compilerPackage: 'tsc-rs',
    tsconfigPath: 'tsconfig.build.json',
  },
} satisfies NextConfig
