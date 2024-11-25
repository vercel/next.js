import { defineConfig } from 'next/config'
import { foo } from 'foo'

const nextConfig = defineConfig({
  env: {
    foo,
  },
})

export default nextConfig
