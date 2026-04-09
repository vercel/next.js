import type { NextConfig } from 'next'
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// top-level await will only work in Native TS mode.
// This is to ensure that the test is running in Native TS mode.
await Promise.resolve()

// import.meta.url only works in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const foo = fs.readFileSync(join(__dirname, 'foo.txt'), 'utf8')

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
