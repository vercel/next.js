import type { NextConfig } from 'next'
import { foo } from './foo.json'

export default {
  env: {
    foo,
  },
} satisfies NextConfig
