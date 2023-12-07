import type { NextConfig } from 'next'
import { myValue } from './env'

const config: NextConfig = {
  env: {
    customKey: myValue,
  },
}

export default config
