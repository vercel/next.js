import type { NextConfig } from 'next'

const config: NextConfig = {
  env: {
    customKey: 'my-value',
  },
}

export { config as default }
