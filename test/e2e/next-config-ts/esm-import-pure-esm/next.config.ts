import type { NextConfig } from 'next'
import pureESM from 'pure-esm-module.mjs'

const config: NextConfig = {
  env: {
    customKey: pureESM,
  },
}

export default config
