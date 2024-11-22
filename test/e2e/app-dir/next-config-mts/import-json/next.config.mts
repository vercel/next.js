import type { NextConfig } from 'next'
// TODO: Use `with` attribute when the CI Node.js version is above 18.20.0
import fooJson from './foo.json' assert { type: 'json' }

export default {
  env: {
    foo: fooJson.foo,
  },
} satisfies NextConfig
