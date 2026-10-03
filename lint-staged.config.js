module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'eslint --config eslint.config.mjs --fix',
  ],
  '*.mdx': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'eslint --config eslint.config.mjs --fix',
    'alex --quiet',
  ],
  '*.{json,css,html,yml,yaml,scss}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
  ],
  '*.md': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'alex --quiet',
  ],
  '*.rs': ['rustfmt --edition 2024 --'],
}
