
// Old, flat shape (mirrors @react-aria/i18n@3.3.x): a single flat CommonJS
// bundle with no `./private` directory and no `useMessageFormatter` export.
//
// Node.js resolves the package entry here (via `main`/the `default` condition)
// because it does not honor the `module` condition that the bundler used. When
// the externalized import is loaded at runtime, `useMessageFormatter` is missing.
exports.somethingElse = function somethingElse() {
  return 'old-flat-v1'
}
