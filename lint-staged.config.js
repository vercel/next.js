module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts,mdx}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'cross-env ESLINT_USE_FLAT_CONFIG=false eslint --config .eslintrc.json --no-eslintrc --fix',
  ],
  '*.{json,md,css,html,yml,yaml,scss}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
  ],
  '*.rs': ['cargo fmt --'],
}
