import { defineConfig } from 'next/config'
import { foobarbaz } from './foo'

const nextConfig = defineConfig({
  env: {
    foobarbaz,
  },
})

export default nextConfig
