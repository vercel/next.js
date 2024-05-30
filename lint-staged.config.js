module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts}': [
    'prettier --write',
    'eslint --no-ignore --max-warnings=0 --fix',
  ],
  '*.{json,md,mdx,css,html,yml,yaml,scss}': ['prettier --write'],
  '*.rs': ['cargo fmt'],
}
