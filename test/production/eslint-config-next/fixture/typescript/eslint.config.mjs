import { defineConfig } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// A TypeScript project, so all files are parsed by typescript-eslint's parser.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.js'],
    rules: { 'no-undef': 'error' },
  },
  {
    rules: { 'import/no-unresolved': 'error' },
  },
])
