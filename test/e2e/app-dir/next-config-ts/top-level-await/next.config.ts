import type { NextConfig } from 'next'

async function getFoo() {
  return 'foo'
}

// top-level await
const foo = await getFoo()

export default {
  env: {
    foo,
  },
} satisfies NextConfig
