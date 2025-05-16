module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts,mdx}': [
    'cross-env ESLINT_USE_FLAT_CONFIG=false eslint --config .eslintrc.json --no-eslintrc --fix',
  ],
  '*.{md,mdx,css,html,yml,yaml,scss}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
  ],
  '*.{js,jsx,ts,tsx,cjs,mjs,d.mts,json,jsonc}': [
    'biome format --write --no-errors-on-unmatched',
  ],
  '*.rs': ['cargo fmt --'],
}
