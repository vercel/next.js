module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts,mdx}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'eslint --config eslint.config.mjs --fix',
  ],
  '*.md': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'alex --quiet',
  ],
  '*.{json,css,html,yml,yaml,scss}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
  ],
  '*.rs': ['rustfmt --edition 2024 --'],
}
