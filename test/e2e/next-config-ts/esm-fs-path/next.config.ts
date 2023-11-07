import fs from 'fs'
import path from 'path'
import type { NextConfig } from 'next'

const config: NextConfig = {
  env: {
    customKey: fs.readFileSync(path.resolve('my-value.txt'), 'utf-8'),
  },
}

export default config
