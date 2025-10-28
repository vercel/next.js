const path = require('path')
module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts,mdx}': [
    `cd ${__dirname} && prettier --with-node-modules --ignore-path ${path.join(__dirname, '.prettierignore')} --config=${path.join(__dirname, '.prettierrc.json')} --write`,
    `cd ${__dirname} && oxfmt --ignore-path ${path.join(__dirname, '.oxfmtignore')} --config=${path.join(__dirname, '.prettierrc.json')}`,
    `cd ${__dirname} && eslint --config ${path.join(__dirname, 'eslint.config.mjs')} --fix`,
  ],
  '*.{json,md,css,html,yml,yaml,scss}': [
    `cd ${__dirname} && prettier --with-node-modules --ignore-path ${path.join(__dirname, '.prettierignore')} --write`,
  ],
  '*.rs': [`cd ${__dirname} && rustfmt --edition 2024 --`],
}
