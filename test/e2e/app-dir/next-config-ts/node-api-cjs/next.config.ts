import type { NextConfig } from 'next'
import fs from 'node:fs'
import { join } from 'node:path'

const foo = fs.readFileSync(join(__dirname, 'foo.txt'), 'utf8')

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
