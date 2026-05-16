import { defineConfig } from 'eslint/config'
import foo from 'foo'
import bar from 'bar'

const eslintConfig = defineConfig([
  foo,
  bar,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
    ],
  },
])

export default eslintConfig
