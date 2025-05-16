module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts,mdx}': [
    'cross-env ESLINT_USE_FLAT_CONFIG=false eslint --config .eslintrc.json --no-eslintrc --fix',
  ],
  '*.{md,mdx,html,yml,yaml}': [
    'prettier --with-node-modules --ignore-path .prettierignore --write',
  ],
  '*.{js,jsx,ts,tsx,cjs,mjs,d.mts,json,jsonc,css,scss}': [
    'biome format --write --no-errors-on-unmatched',
  ],
  '*.rs': ['cargo fmt --'],
}
