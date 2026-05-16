import type { Linter } from 'eslint'
import nextPlugin from '@next/eslint-plugin-next'
import baseConfig from './index'

const config: Linter.Config[] = [
  ...baseConfig,
  nextPlugin.configs['core-web-vitals'],
]

// Use `export =` instead of `export default` for ESLint parser compatibility.
// ESLint expects parser modules to be directly importable as CommonJS modules (module.exports).
export = config
