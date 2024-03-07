import type { NextConfig } from 'next'
import fs from 'fs'
// named import also works
import { join } from 'path'

const foo = fs.readFileSync(join(__dirname, 'foo.txt'), 'utf8')

const nextConfig: NextConfig = {
  env: {
    foo,
  },
}

export default nextConfig
