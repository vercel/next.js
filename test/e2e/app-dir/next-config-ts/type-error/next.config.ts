import { defineConfig } from 'next/config'

// type error
let foo: number = 'foo'

const nextConfig = defineConfig({
  env: {
    foo,
  },
})

export default nextConfig
