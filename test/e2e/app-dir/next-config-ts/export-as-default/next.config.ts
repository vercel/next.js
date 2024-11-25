import { defineConfig } from 'next/config'

const nextConfig = defineConfig({
  env: {
    foo: 'foo',
  },
})

export { nextConfig as default }
