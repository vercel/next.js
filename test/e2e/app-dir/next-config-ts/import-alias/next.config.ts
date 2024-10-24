import { defineConfig } from 'next/config'
import { foo } from '@/foo'
import { bar } from 'bar'

const nextConfig = defineConfig({
  env: {
    foo,
    bar,
  },
})

export default nextConfig
