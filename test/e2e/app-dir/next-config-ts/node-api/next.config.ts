import type { NextConfig } from 'next'
import fs from 'fs'
import path from 'path'

const foo = fs.readFileSync(path.join(__dirname, 'foo.txt'), 'utf8')

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
