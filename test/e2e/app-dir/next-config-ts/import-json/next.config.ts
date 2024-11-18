import type { NextConfig } from 'next'
import fooJson from './foo.json' with { type: 'json' }

export default {
  env: {
    foo: fooJson.foo,
  },
} satisfies NextConfig
