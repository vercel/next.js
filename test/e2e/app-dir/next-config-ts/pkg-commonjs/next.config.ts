import type { NextConfig } from 'next'
import { cjs } from './fixtures/cjs.cjs'
import { mjs } from './fixtures/mjs.mjs'
import { cts } from './fixtures/cts.cts'
import { mts } from './fixtures/mts.mts'
import { ts } from './fixtures/ts'
import { commonjs } from './fixtures/commonjs'

const nextConfig: NextConfig = {
  env: {
    cjs,
    mjs,
    cts,
    mts,
    ts,
    commonjs,
  },
}

export default nextConfig
