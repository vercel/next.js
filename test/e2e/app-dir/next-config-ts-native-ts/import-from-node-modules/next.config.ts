import type { NextConfig } from 'next'
import cjs from 'cjs'
import mjs from 'mjs'
import jsCJS from 'js-cjs'
import jsESM from 'js-esm'

// top-level await will only work in Native TS mode.
// This is to ensure that the test is running in Native TS mode.
await Promise.resolve()

const nextConfig: NextConfig = {
  env: {
    cjs,
    mjs,
    jsCJS,
    jsESM,
  },
}

export default nextConfig
