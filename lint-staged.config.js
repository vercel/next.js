module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts,mdx}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'eslint --config eslint.config.mjs --fix',
  ],
  '*.{json,md,css,html,yml,yaml,scss}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
  ],
  '*.rs': ['rustfmt --edition 2024 --'],
  // Go code: Switchyard, route.go templates and test fixtures. Needs Go on
  // PATH, only for commits that change a .go file.
  '*.go': ['gofmt -w'],
}
