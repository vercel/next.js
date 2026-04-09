import type { NextConfig } from 'next'
import fs from 'node:fs'
import { join } from 'node:path'

// top-level await will only work in Native TS mode.
// This is to ensure that the test is running in Native TS mode.
await Promise.resolve()

const foo = fs.readFileSync(join('.', 'foo.txt'), 'utf8')

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
