import type { NextConfig } from 'next'
import cjs from './fixtures/cjs.cjs'
import mjs from './fixtures/mjs.mjs'
import * as cts from './fixtures/cts.cts'
import mts from './fixtures/mts.mts'
import ts from './fixtures/ts.ts'
import js from './fixtures/js-esm.js'

// top-level await will only work in Native TS mode.
// This is to ensure that the test is running in Native TS mode.
await Promise.resolve()

const nextConfig: NextConfig = {
  env: {
    cjs,
    mjs,
    // Node.js native TS can't handle `export =` syntax.
    cts: (cts as any).default,
    mts,
    ts,
    js,
  },
}

export default nextConfig
