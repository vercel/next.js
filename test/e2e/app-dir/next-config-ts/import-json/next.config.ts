import { defineConfig } from 'next/config'
import { foo } from './foo.json'

export default defineConfig({
  env: {
    foo,
  },
})
