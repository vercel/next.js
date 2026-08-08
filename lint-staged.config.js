const { lstatSync } = require('node:fs')

function withoutSymlinks(files) {
  return files.filter((file) => {
    const stat = lstatSync(file, { throwIfNoEntry: false })
    return stat && !stat.isSymbolicLink()
  })
}

function format(files, commands) {
  const regularFiles = withoutSymlinks(files)
  return regularFiles.length > 0
    ? commands.map(
        (command) =>
          `${command} ${regularFiles.map((file) => JSON.stringify(file)).join(' ')}`
      )
    : []
}

module.exports = {
  '*.{js,jsx,mjs,ts,tsx,mts,mdx}': (files) =>
    format(files, [
      'prettier --with-node-modules --ignore-path .prettierignore --write',
      'eslint --config eslint.config.mjs --fix',
    ]),
  '*.{json,md,css,html,yml,yaml,scss}': (files) =>
    format(files, [
      'prettier --with-node-modules --ignore-path .prettierignore --write',
    ]),
  '*.rs': ['rustfmt --edition 2024 --'],
}
