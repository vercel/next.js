import type { NextConfig } from 'next'
import cjs from 'cjs'
import mjs from 'mjs'
import jsCJS from 'js-cjs'
import jsESM from 'js-esm'

const nextConfig: NextConfig = {
  env: {
    cjs,
    mjs,
    jsCJS,
    jsESM,
  },
}

export default nextConfig
