import type { Linter } from 'eslint'

const config: Linter.LegacyConfig = {
  extends: [require.resolve('.'), 'plugin:@next/next/core-web-vitals-legacy'],
}

// Use `export =` instead of `export default` for ESLint parser compatibility.
// ESLint expects parser modules to be directly importable as CommonJS modules (module.exports).
export = config
