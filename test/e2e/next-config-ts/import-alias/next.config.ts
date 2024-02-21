import type { NextConfig } from 'next'
import { myValue } from '@/env'
import { utils } from 'utils/utils'

const config: NextConfig = {
  env: {
    customKey: myValue,
    utils,
  },
}

export default config
