import type { NextConfig } from 'next'

const { foo } = await import('./foo')

export default {
  env: {
    foo,
  },
} satisfies NextConfig
