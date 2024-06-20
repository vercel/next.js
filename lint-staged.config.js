module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
    'eslint --fix',
  ],
  '*.{json,md,mdx,css,html,yml,yaml,scss}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
  ],
  '*.rs': ['cargo fmt --'],
}
